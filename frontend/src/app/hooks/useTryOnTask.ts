"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { backendApiUrl } from "@/lib/backend-api";

interface TryOnTaskInput {
    personBase64: string;
    garmentImageUrl: string;
    userId?: string;
<<<<<<< HEAD
=======
    garmentId?: string;
>>>>>>> 0c25ba15c222c12c464574e5a4df8977d0ca87d8
}

export type TryOnStatus = "processing" | "done" | "error";

export interface TryOnTask {
    status: TryOnStatus;
    garmentUrl: string;
    personPreview: string;
    resultImage: string | null;
    error: string | null;
    storedPath: string | null;
    storedUrl: string | null;
}

export function useTryOnTask() {
    const [task, setTask] = useState<TryOnTask | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            abortRef.current?.abort();
        };
    }, []);

    const startTryOn = useCallback((input: TryOnTaskInput) => {
        // Abort any in-flight request
        abortRef.current?.abort();

        const controller = new AbortController();
        abortRef.current = controller;

        setTask({
            status: "processing",
            garmentUrl: input.garmentImageUrl,
            personPreview: input.personBase64,
            resultImage: null,
            error: null,
            storedPath: null,
            storedUrl: null,
        });

        fetch(backendApiUrl("/api/tryon"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                person_image: input.personBase64,
                cloth_image_url: input.garmentImageUrl,
<<<<<<< HEAD
                ...(input.userId ? { user_id: input.userId } : {}),
=======
                user_id: input.userId,
                garment_id: input.garmentId,
>>>>>>> 0c25ba15c222c12c464574e5a4df8977d0ca87d8
            }),
            signal: controller.signal,
        })
            .then(async (resp) => {
                if (!resp.ok) {
                    const data = await resp.json().catch(() => null);
                    throw new Error(data?.error || `Try-on failed (${resp.status})`);
                }
                return resp.json();
            })
            .then((data) => {
                if (!mountedRef.current || controller.signal.aborted) return;
                if (data.image) {
                    setTask((prev) =>
                        prev && prev.status === "processing"
                            ? {
                                  ...prev,
                                  status: "done",
                                  resultImage: data.image,
                                  storedPath: data.stored_path ?? null,
                                  storedUrl: data.stored_url ?? null,
                              }
                            : prev,
                    );
                } else {
                    setTask((prev) =>
                        prev && prev.status === "processing"
                            ? { ...prev, status: "error", error: "No result image returned" }
                            : prev,
                    );
                }
            })
            .catch((err: unknown) => {
                if (!mountedRef.current) return;
                if (err instanceof Error && err.name === "AbortError") return;
                const message = err instanceof Error ? err.message : "Try-on failed";
                setTask((prev) =>
                    prev && prev.status === "processing"
                        ? { ...prev, status: "error", error: message }
                        : prev,
                );
            });
    }, []);

    const dismiss = useCallback(() => {
        abortRef.current?.abort();
        setTask(null);
    }, []);

    return { task, startTryOn, dismiss };
}
