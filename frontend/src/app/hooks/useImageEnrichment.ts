"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { backendApiUrl } from "@/lib/backend-api";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export type EnrichmentStatus =
    | "idle"
    | "uploading"
    | "understanding"
    | "ready"
    | "error";

export interface EnrichmentState {
    status: EnrichmentStatus;
    id: string | null;
    gcsUrl: string | null;
    description: string | null;
    viewType: string | null;
    duplicate: boolean;
    error: string | null;
}

interface UploadAssetResponse {
    id?: string;
    gcs_url?: string;
    duplicate?: boolean;
    error?: string;
}

interface UserInputImageRow {
    id: string;
    description: string | null;
    view_type: string | null;
}

const INITIAL: EnrichmentState = {
    status: "idle",
    id: null,
    gcsUrl: null,
    description: null,
    viewType: null,
    duplicate: false,
    error: null,
};

export function useImageEnrichment() {
    const [state, setState] = useState<EnrichmentState>(INITIAL);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            channelRef.current?.unsubscribe();
            channelRef.current = null;
            if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
        };
    }, []);

    const stopWatchers = useCallback(() => {
        if (channelRef.current) {
            channelRef.current.unsubscribe();
            channelRef.current = null;
        }
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    const applyReady = useCallback((row: UserInputImageRow) => {
        if (!mountedRef.current) return;
        setState((prev) => ({
            ...prev,
            status: "ready",
            description: row.description,
            viewType: typeof row.view_type === "string" ? row.view_type : prev.viewType,
        }));
        stopWatchers();
    }, [stopWatchers]);

    const subscribe = useCallback((id: string) => {
        stopWatchers();

        // Realtime path — instant when the publication/RLS allows it.
        const supabase = getSupabaseBrowser();
        const channel = supabase
            .channel(`user_input_images:${id}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "user_input_images",
                    filter: `id=eq.${id}`,
                },
                (payload) => {
                    const row = payload.new as UserInputImageRow;
                    if (row?.description) applyReady(row);
                },
            )
            .subscribe();
        channelRef.current = channel;

        // Polling fallback via backend /api/images (service role — bypasses RLS).
        // Runs in parallel with realtime; whichever sees the enrichment first wins.
        let elapsed = 0;
        pollTimerRef.current = setInterval(async () => {
            elapsed += 2000;
            if (!mountedRef.current) return;
            try {
                const resp = await fetch(backendApiUrl("/api/images"));
                if (resp.ok) {
                    const data = await resp.json();
                    const list: Array<{ id: string; description: string | null; view_type: string | null }> =
                        data?.images ?? data?.assets ?? [];
                    const row = list.find((r) => r.id === id);
                    if (row?.description) {
                        applyReady({ id: row.id, description: row.description, view_type: row.view_type });
                        return;
                    }
                }
            } catch {
                // transient — keep polling
            }
            if (elapsed >= 90_000 && pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
        }, 2000);
    }, [stopWatchers, applyReady]);

    const startEnrichment = useCallback(
        async (params: { userId?: string; imageBase64: string }) => {
            if (!params.imageBase64) {
                setState({ ...INITIAL, status: "error", error: "Missing image" });
                return;
            }

            stopWatchers();
            setState({ ...INITIAL, status: "uploading" });

            let data: UploadAssetResponse;
            try {
                const resp = await fetch(backendApiUrl("/api/upload-asset"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        kind: "input",
                        image: params.imageBase64,
                    }),
                });
                data = await resp.json();
                if (!resp.ok) {
                    throw new Error(data?.error || `Upload failed (${resp.status})`);
                }
            } catch (err) {
                if (!mountedRef.current) return;
                const message = err instanceof Error ? err.message : "Upload failed";
                setState({ ...INITIAL, status: "error", error: message });
                return;
            }

            if (!data.id || !data.gcs_url) {
                setState({ ...INITIAL, status: "error", error: "Upload response missing id/url" });
                return;
            }

            if (!mountedRef.current) return;

            const id = data.id;
            const gcsUrl = data.gcs_url;
            const duplicate = !!data.duplicate;

            // Dedup hit: row might already be enriched. Check once via backend (bypasses RLS).
            if (duplicate) {
                try {
                    const resp = await fetch(backendApiUrl("/api/images"));
                    if (resp.ok) {
                        const payload = await resp.json();
                        const list: Array<{ id: string; description: string | null; view_type: string | null }> =
                            payload?.images ?? payload?.assets ?? [];
                        const existing = list.find((r) => r.id === id);
                        if (existing?.description) {
                            if (!mountedRef.current) return;
                            setState({
                                status: "ready",
                                id,
                                gcsUrl,
                                description: existing.description,
                                viewType: existing.view_type,
                                duplicate: true,
                                error: null,
                            });
                            return;
                        }
                    }
                } catch {
                    // fall through to subscribing anyway
                }
            }

            if (!mountedRef.current) return;
            setState({
                status: "understanding",
                id,
                gcsUrl,
                description: null,
                viewType: null,
                duplicate,
                error: null,
            });
            subscribe(id);
        },
        [stopWatchers, subscribe],
    );

    const reset = useCallback(() => {
        stopWatchers();
        setState(INITIAL);
    }, [stopWatchers]);

    return { state, startEnrichment, reset };
}
