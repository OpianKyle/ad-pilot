import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Facebook,
  Instagram,
  LoaderCircle,
  Radio,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import {
  getGetAdpilotMetaConnectionQueryKey,
  getListAdpilotScheduledPostsQueryKey,
  useDisconnectAdpilotMeta,
  useGetAdpilotMetaConnection,
  useGetCsrfToken,
  useSelectAdpilotMetaAssets,
  useStartAdpilotOAuth,
} from "@workspace/api-client-react";
import type { MetaConnectionStatus } from "@workspace/api-client-react";
import { Link } from "wouter";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The request could not be completed. Try again.";
}

function csrfHeaders(token: string | undefined): Record<string, string> {
  return token ? { "X-CSRF-Token": token } : {};
}

export default function MetaChannelsPage() {
  const queryClient = useQueryClient();
  const csrf = useGetCsrfToken({ request: { credentials: "include" } });
  const connection = useGetAdpilotMetaConnection({
    request: { credentials: "include" },
    query: { refetchOnWindowFocus: true, staleTime: 0 },
  });
  const mutationRequest = {
    credentials: "include" as const,
    headers: csrfHeaders(csrf.data?.csrf),
  };
  const start = useStartAdpilotOAuth({ request: mutationRequest });
  const select = useSelectAdpilotMetaAssets({ request: mutationRequest });
  const disconnect = useDisconnectAdpilotMeta({ request: mutationRequest });
  const [facebookPageId, setFacebookPageId] = useState("");
  const [instagramAccountId, setInstagramAccountId] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("meta");
    if (result === "connected") {
      setNotice("Meta is connected. Choose the Page and Instagram account for this business.");
      void connection.refetch();
      void queryClient.invalidateQueries({ queryKey: getListAdpilotScheduledPostsQueryKey() });
    } else if (result === "cancelled") {
      setNotice("Meta authorization was cancelled. You can connect again whenever you’re ready.");
    } else if (result === "failed") {
      setNotice("Meta couldn’t complete the connection. Check your app permissions and try again.");
    }
    if (result) {
      params.delete("meta");
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
    }
  }, []);

  useEffect(() => {
    const status = connection.data;
    if (!status) return;
    setFacebookPageId(status.facebookPageId ?? "");
    setInstagramAccountId(status.instagramAccountId ?? "");
  }, [connection.data]);

  function connectMeta() {
    setNotice("");
    start.mutate(
      { provider: "meta" },
      {
        onSuccess: ({ url }) => window.location.assign(url),
        onError: (error) => setNotice(errorMessage(error)),
      },
    );
  }

  function saveDestinations(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!facebookPageId && !instagramAccountId) {
      setNotice("Choose at least one Facebook or Instagram destination.");
      return;
    }
    const destinations =
      facebookPageId && instagramAccountId
        ? { facebookPageId, instagramAccountId }
        : facebookPageId
          ? { facebookPageId }
          : { instagramAccountId };
    select.mutate(
      { data: destinations },
      {
        onSuccess: (status: MetaConnectionStatus) => {
          queryClient.setQueryData(getGetAdpilotMetaConnectionQueryKey(), status);
          void queryClient.invalidateQueries({ queryKey: getGetAdpilotMetaConnectionQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListAdpilotScheduledPostsQueryKey() });
          setNotice("Your publishing destinations have been saved for this business.");
        },
        onError: (error) => setNotice(errorMessage(error)),
      },
    );
  }

  function disconnectMeta() {
    if (
      !window.confirm(
        "Disconnect Meta for this business? Scheduled posts will be cancelled; published posts will remain on Meta.",
      )
    ) {
      return;
    }
    disconnect.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(
          getGetAdpilotMetaConnectionQueryKey(),
          emptyConnection(),
        );
        void queryClient.invalidateQueries({ queryKey: getGetAdpilotMetaConnectionQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListAdpilotScheduledPostsQueryKey() });
        setFacebookPageId("");
        setInstagramAccountId("");
        setNotice("Meta has been disconnected. Existing published posts were not removed.");
      },
      onError: (error) => setNotice(errorMessage(error)),
    });
  }

  const status = connection.data;
  const connected = Boolean(status?.connected);
  const canSave =
    Boolean(csrf.data?.csrf) &&
    Boolean(facebookPageId || instagramAccountId) &&
    !select.isPending;

  return (
    <section className="apw-page apw-page-enter" data-testid="page-channel-connections">
      <div className="apw-heading">
        <div>
          <div className="apw-eyebrow"><span />Your channels, your choice</div>
          <h1>Connect Meta.</h1>
          <p>Authorize this business’s Facebook Page and linked Instagram professional account for photo publishing.</p>
        </div>
        <div className="apw-heading-actions">
          <Link href="/planner" className="apw-button apw-button-secondary">
            Open publishing planner <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {notice && (
        <div className="apw-safety-strip mb-4" role="status" data-testid="status-meta-connection">
          <ShieldCheck size={17} />
          <p>{notice}</p>
        </div>
      )}
      {csrf.isError && (
        <div className="apw-inline-load-error mb-4" role="alert" data-testid="status-meta-csrf-error">
          <span>{errorMessage(csrf.error)}</span>
          <button onClick={() => void csrf.refetch()} data-testid="button-retry-meta-csrf">Retry security check</button>
        </div>
      )}

      {connection.isLoading ? (
        <div className="apw-panel apw-connection-loading" role="status" aria-label="Loading Meta connection">
          <i /><i /><i /><span>Checking this business’s Meta connection</span>
        </div>
      ) : connection.isError ? (
        <div className="apw-panel p-6" role="alert" data-testid="status-meta-load-error">
          <h2 className="font-display text-lg font-bold text-[#344139]">Connection status is unavailable.</h2>
          <p className="mt-2 text-sm text-[#858d83]">{errorMessage(connection.error)}</p>
          <button className="apw-button apw-button-secondary mt-4" onClick={() => void connection.refetch()}>
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      ) : (
        <>
          <div className="apw-connection-header">
            <div className="apw-connection-header-icon"><Radio size={20} /></div>
            <div>
              <strong>{connected ? "Meta account connected" : "No Meta account connected"}</strong>
              <span>{connected ? "Only this business workspace can use this authorization." : "Each business connects its own Facebook and Instagram assets."}</span>
            </div>
            <span className={`apw-status-chip ${connected ? "apw-status-connected" : ""}`}>
              <i />{connected ? "CONNECTED" : "NOT CONNECTED"}
            </span>
          </div>

          {!connected ? (
            <div className="apw-panel p-6 md:p-8">
              <div className="flex items-start gap-4">
                <div className="apw-channel-logo apw-channel-facebook"><Facebook size={19} /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-bold text-[#344139]">Authorize through Meta.</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#788278]">
                    Meta will ask you to sign in and choose the Pages this business may publish to. AdPilot stores the authorization encrypted on the server; access tokens are never shown in the browser.
                  </p>
                  <button
                    className="apw-button apw-button-primary mt-5"
                    onClick={connectMeta}
                    disabled={!csrf.data?.csrf || start.isPending}
                    data-testid="button-connect-meta"
                  >
                    {start.isPending ? <LoaderCircle className="animate-spin" size={15} /> : <Facebook size={15} />}
                    {start.isPending ? "Opening Meta…" : "Connect Facebook and Instagram"}
                  </button>
                  {start.isError && <p className="mt-3 text-sm text-[#ad6345]" role="alert">{errorMessage(start.error)}</p>}
                </div>
              </div>
            </div>
          ) : (
            <>
              <form className="apw-panel mt-4 p-5 md:p-7" onSubmit={saveDestinations} data-testid="form-meta-destinations">
                <div className="mb-5">
                  <div className="apw-overline">PUBLISHING DESTINATIONS</div>
                  <h2 className="mt-1 font-display text-xl font-bold text-[#344139]">Choose where this business can publish.</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#788278]">
                    Instagram uses the professional account linked to its own Page. Choose Facebook and Instagram destinations independently.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="field-label">
                    <span className="mb-2 flex items-center gap-2"><Facebook size={15} /> Facebook Page</span>
                    <select
                      className="form-input"
                      value={facebookPageId}
                      onChange={(event) => setFacebookPageId(event.target.value)}
                      data-testid="select-meta-facebook-page"
                    >
                      <option value="">Don’t publish to Facebook</option>
                      {(status?.availableFacebookPages ?? []).map((page) => (
                        <option value={page.id} key={page.id}>{page.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    <span className="mb-2 flex items-center gap-2"><Instagram size={15} /> Linked Instagram account</span>
                    <select
                      className="form-input"
                      value={instagramAccountId}
                      onChange={(event) => setInstagramAccountId(event.target.value)}
                      disabled={(status?.availableInstagramAccounts.length ?? 0) === 0}
                      data-testid="select-meta-instagram-account"
                    >
                      <option value="">Don’t publish to Instagram</option>
                      {(status?.availableInstagramAccounts ?? []).map((account) => (
                        <option value={account.id} key={account.id}>{account.name}</option>
                      ))}
                    </select>
                    {(status?.availableInstagramAccounts.length ?? 0) === 0 && (
                      <span className="mt-1 block text-xs font-normal text-[#8b9289]">No linked professional Instagram accounts were shared with this app.</span>
                    )}
                  </label>
                </div>
                {status?.availableFacebookPages.length === 0 && (
                  <div className="mt-4 rounded-xl border border-[#eadbc8] bg-[#faf5ec] p-4 text-sm leading-6 text-[#8b7759]" role="status">
                    Meta did not share any Pages with this app. Confirm that your account has Page access and that the app has the required Page permissions, then reconnect.
                  </div>
                )}
                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#eeece4] pt-5">
                  <button
                    className="apw-button apw-button-primary"
                    type="submit"
                    disabled={!canSave}
                    data-testid="button-save-meta-destinations"
                  >
                    {select.isPending ? <LoaderCircle className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
                    Save destinations
                  </button>
                  <button
                    className="apw-button apw-button-secondary"
                    type="button"
                    onClick={connectMeta}
                    disabled={!csrf.data?.csrf || start.isPending}
                    data-testid="button-reconnect-meta"
                  >
                    <RefreshCw size={14} /> Reconnect
                  </button>
                  <button
                    className="apw-button apw-button-danger ml-auto"
                    type="button"
                    onClick={disconnectMeta}
                    disabled={!csrf.data?.csrf || disconnect.isPending}
                    data-testid="button-disconnect-meta"
                  >
                    {disconnect.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <Unplug size={14} />}
                    Disconnect
                  </button>
                </div>
                {(select.isError || disconnect.isError) && (
                  <p className="mt-3 text-sm text-[#ad6345]" role="alert">
                    {errorMessage(select.error ?? disconnect.error)}
                  </p>
                )}
              </form>

              <div className="apw-safety-strip mt-4">
                <ShieldCheck size={17} />
                <p><strong>Meta app review may be required.</strong> Until Meta approves advanced access, only app administrators, developers, and testers may be able to authorize or publish. Photo publishing requires the Page and Instagram permissions enabled in your Meta app.</p>
              </div>
            </>
          )}

          {connected && (
            <div className="apw-channel-list mt-4">
              <article className="apw-panel apw-channel-card">
                <div className="apw-channel-logo apw-channel-facebook"><Facebook size={17} /></div>
                <div className="apw-channel-copy"><h2>Facebook Page</h2><span>Photo posts</span><p>{status?.facebookPageName ?? "Select a Page to enable publishing."}</p></div>
                <span className="apw-channel-disconnected"><i />{status?.facebookPageId ? "Ready" : "Not selected"}</span>
              </article>
              <article className="apw-panel apw-channel-card">
                <div className="apw-channel-logo apw-channel-instagram"><Instagram size={17} /></div>
                <div className="apw-channel-copy"><h2>Instagram</h2><span>Professional account · photo posts</span><p>{status?.instagramUsername ? `@${status.instagramUsername}` : "Select an account linked to your Facebook Page."}</p></div>
                <span className="apw-channel-disconnected"><i />{status?.instagramAccountId ? "Ready" : "Not selected"}</span>
              </article>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function emptyConnection(): MetaConnectionStatus {
  return {
    connected: false,
    connectedAt: null,
    facebookPageId: null,
    facebookPageName: null,
    instagramAccountId: null,
    instagramUsername: null,
    availableFacebookPages: [],
    availableInstagramAccounts: [],
  };
}
