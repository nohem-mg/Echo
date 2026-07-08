export type SoundCloudPublishResponse = {
  soundcloud_url: string;
  track_id: number;
  permalink: string;
  request_id: string;
};

export type SoundCloudPublishState =
  | { status: "idle" }
  | { status: "publishing" }
  | { status: "published"; response: SoundCloudPublishResponse }
  | { status: "error"; error: string };

/**
 * Runs the SoundCloud OAuth popup flow and resolves with an access token
 * once the callback window posts back a result.
 */
export function requestSoundCloudToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    fetch("/api/soundcloud/oauth/start")
      .then((r) => r.json() as Promise<{ auth_url: string; error?: string }>)
      .then(({ auth_url, error }) => {
        if (error || !auth_url) {
          reject(new Error(error ?? "Failed to get SoundCloud auth URL"));
          return;
        }

        const popup = window.open(auth_url, "soundcloud_oauth", "width=600,height=700,noopener=0");
        if (!popup) {
          reject(new Error("Popup blocked — please allow popups for this site"));
          return;
        }

        const onMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          const data = event.data as { type?: string; access_token?: string; error?: string };
          if (data.type === "soundcloud_auth_success") {
            cleanup();
            resolve(data.access_token ?? "");
          } else if (data.type === "soundcloud_auth_error") {
            cleanup();
            reject(new Error(data.error ?? "SoundCloud authorization failed"));
          }
        };

        const checkClosed = setInterval(() => {
          if (popup.closed) {
            cleanup();
            reject(new Error("SoundCloud authorization was cancelled"));
          }
        }, 800);

        function cleanup() {
          clearInterval(checkClosed);
          window.removeEventListener("message", onMessage);
        }

        window.addEventListener("message", onMessage);
      })
      .catch(reject);
  });
}
