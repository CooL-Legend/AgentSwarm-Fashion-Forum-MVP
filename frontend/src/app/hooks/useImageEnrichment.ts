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
    viewType: number | null;
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
    view_type: number | null;
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
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            channelRef.current?.unsubscribe();
            channelRef.current = null;
        };
    }, []);

    const closeChannel = useCallback(() => {
        if (channelRef.current) {
            channelRef.current.unsubscribe();
            channelRef.current = null;
        }
    }, []);

    const subscribe = useCallback((id: string) => {
        closeChannel();
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
                    if (row?.description) {
                        if (!mountedRef.current) return;
                        setState((prev) => ({
                            ...prev,
                            status: "ready",
                            description: row.description,
                            viewType: typeof row.view_type === "number" ? row.view_type : prev.viewType,
                        }));
                        closeChannel();
                    }
                },
            )
            .subscribe();
        channelRef.current = channel;
    }, [closeChannel]);

    const startEnrichment = useCallback(
        async (params: { userId: string; imageBase64: string }) => {
            if (!params.userId || !params.imageBase64) {
                setState({ ...INITIAL, status: "error", error: "Missing user or image" });
                return;
            }

            closeChannel();
            setState({ ...INITIAL, status: "uploading" });

            let data: UploadAssetResponse;
            try {
                const resp = await fetch(backendApiUrl("/api/upload-asset"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: params.userId,
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

            // Dedup hit: row might already be enriched. Check once before subscribing.
            if (duplicate) {
                try {
                    const supabase = getSupabaseBrowser();
                    const { data: rows } = await supabase
                        .from("user_input_images")
                        .select("id, description, view_type")
                        .eq("id", id)
                        .limit(1);
                    const existing = rows?.[0] as UserInputImageRow | undefined;
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
        [closeChannel, subscribe],
    );

    const reset = useCallback(() => {
        closeChannel();
        setState(INITIAL);
    }, [closeChannel]);

    return { state, startEnrichment, reset };
}
