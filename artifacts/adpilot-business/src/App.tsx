import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  useCreateCampaign,
  useGetCsrfToken,
  useGetCurrentUser,
  useGetDashboardSummary,
  useListCampaigns,
  useLoginAccount,
  useLogoutAccount,
  useRegisterAccount,
} from '@workspace/api-client-react';
import type { Campaign, CampaignInput, LoginInput, RegistrationInput } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import PreviewWorkspace from '@/pages/preview-workspace';
import MetaChannelsPage from '@/pages/meta-channels';
import PublishingPlannerPage from '@/pages/publishing-planner';
import type { ApprovedAiCreative } from '@/lib/creative-handoff';
import { workspaceSections } from '@/lib/workspace-sections';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Radio,
  Search,
  Send,
  X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = httpStatus(error);
        if (status !== undefined && status < 500) return false;
        if (status === 503) return false;
        return failureCount < 1;
      },
    },
  },
});
const userKey = ['/api/auth/me'];
const summaryKey = ['/api/dashboard/summary'];
const campaignsKey = ['/api/campaigns'];

function messageFrom(error: unknown, fallback: string) {
  if (httpStatus(error) === 503) {
    return 'Connect your new MySQL database details to enable this workspace.';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function httpStatus(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return error.status;
  }
  return undefined;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function AppFrame() {
  const [location, setLocation] = useLocation();
  const csrf = useGetCsrfToken();
  const current = useGetCurrentUser({ request: { credentials: 'include' } });
  const logout = useLogoutAccount({ request: { credentials: 'include', headers: csrf.data?.csrf ? { 'X-CSRF-Token': csrf.data.csrf } : {} } });
  const [mobileNav, setMobileNav] = useState(false);
  const [plannerDraft, setPlannerDraft] = useState<ApprovedAiCreative | null>(null);
  const queryClient = useQueryClient();
  const user = current.data?.user;
  const mysqlSetupNeeded =
    httpStatus(current.error) === 503 || httpStatus(csrf.error) === 503;
  const isAuthRoute = location === '/login' || location === '/register';
  const activeWorkspaceSection = workspaceSections.find((section) => section.path === location);
  const isLivePublishingRoute = location === '/connections' || location === '/planner';
  const embeddedSection =
    activeWorkspaceSection && activeWorkspaceSection.id !== 'overview'
      ? activeWorkspaceSection
      : undefined;
  const selectedNavPath = location === '/campaigns' ? '/planner' : location;
  const handleAiCreativeApproved = useCallback((draft: ApprovedAiCreative) => {
    setPlannerDraft(draft);
    setLocation('/planner');
  }, [setLocation]);
  const clearPlannerDraft = useCallback(() => setPlannerDraft(null), []);

  useEffect(() => {
    setMobileNav(false);
  }, [location]);

  const signOut = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(userKey, undefined);
        queryClient.removeQueries({ queryKey: summaryKey });
        queryClient.removeQueries({ queryKey: campaignsKey });
        setPlannerDraft(null);
        setLocation('/login');
      },
    });
  };

  return (
    <div className="min-h-[100dvh] bg-[#f5f3ec] text-[#28323a]">
      {isAuthRoute ? (
        <Switch>
          <Route path="/login"><AuthPage mode="login" /></Route>
          <Route path="/register"><AuthPage mode="register" /></Route>
          <Route component={NotFound} />
        </Switch>
      ) : (
        <div className="apw-root">
          <aside className={`apw-sidebar ${mobileNav ? 'apw-sidebar-open' : ''}`} aria-label="Workspace navigation">
            <div className="apw-brand-lockup">
              <Link href="/" className="apw-auth-brand" data-testid="link-brand-home">
                <span className="apw-brand-mark"><Radio size={18} strokeWidth={2.2} /></span>
                <span className="apw-wordmark">adpilot<span>.</span></span>
              </Link>
              <button onClick={() => setMobileNav(false)} className="apw-mobile-close" aria-label="Close navigation" data-testid="button-close-navigation"><X size={18} /></button>
            </div>
            {user && <div className="apw-demo-pill"><span />{isLivePublishingRoute ? 'LIVE CHANNELS' : 'SECTION PREVIEW'}</div>}
            <nav className={`apw-nav ${user ? '' : 'apw-auth-nav'}`}>
              {user ? (
                (['Workspace', 'Campaigns', 'Business'] as const).map((group) => (
                  <div className="apw-nav-group" key={group}>
                    <div className="apw-nav-heading">{group}</div>
                    {workspaceSections.filter((section) => section.group === group).map(({ id, label, icon: Icon, path }) => (
                      <Link
                        key={id}
                        href={path}
                        className={`apw-nav-item ${selectedNavPath === path ? 'apw-nav-selected' : ''}`}
                        aria-current={selectedNavPath === path ? 'page' : undefined}
                        data-testid={id === 'overview' ? 'link-dashboard' : `link-workspace-${id}`}
                      >
                        <Icon size={17} strokeWidth={1.8} />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                ))
              ) : (
                <div className="apw-nav-group">
                  <div className="apw-nav-heading">Workspace</div>
                  <Link href="/" className={`apw-nav-item ${location === '/' ? 'apw-nav-selected' : ''}`} aria-current={location === '/' ? 'page' : undefined} data-testid="link-dashboard"><LayoutDashboard size={17} strokeWidth={1.8} /><span>Overview</span></Link>
                  <Link href="/campaigns" className={`apw-nav-item ${location === '/campaigns' ? 'apw-nav-selected' : ''}`} aria-current={location === '/campaigns' ? 'page' : undefined} data-testid="link-campaigns"><FileText size={17} strokeWidth={1.8} /><span>Campaigns</span></Link>
                </div>
              )}
            </nav>
            <div className="apw-sidebar-bottom">
              <div className="apw-sidebar-note">
                <div className="apw-note-icon"><CircleHelp size={15} /></div>
                <p>{isLivePublishingRoute ? 'Each business connects and publishes only through its own Meta destinations.' : user ? 'Your work stays here until you decide what to do next.' : 'Your campaigns stay here while you shape the next step.'}</p>
                <span>{isLivePublishingRoute ? 'BUSINESS-OWNED DESTINATIONS' : user ? 'NO CONNECTIONS · NO PUBLISHING' : 'CHANNELS NOT CONNECTED'}</span>
              </div>
              {user ? (
                <div className="apw-user-chip">
                  <div className="apw-avatar">{user.name.trim().slice(0, 1).toUpperCase()}</div>
                  <div><strong data-testid="text-account-name">{user.name}</strong><span>{user.email}</span></div>
                  <button onClick={signOut} disabled={logout.isPending || !csrf.data?.csrf} title="Sign out" aria-label="Sign out" data-testid="button-sign-out" className="apw-signout">
                    {logout.isPending ? <LoaderCircle className="animate-spin" size={16} /> : <LogOut size={16} />}
                  </button>
                </div>
              ) : (
                <div className="apw-user-chip"><Link href="/login" className="apw-nav-item" data-testid="link-sign-in"><LogOut size={17} /><span>Sign in</span></Link></div>
              )}
            </div>
          </aside>

          {mobileNav && <button aria-label="Close navigation overlay" className="apw-mobile-scrim" onClick={() => setMobileNav(false)} data-testid="button-navigation-overlay" />}
          <main className="apw-main">
            <header className="apw-topbar">
              <button className="apw-menu-toggle" aria-label="Open navigation" onClick={() => setMobileNav(true)} data-testid="button-open-navigation"><Menu size={19} /></button>
              <div className="apw-breadcrumb"><span>ADPILOT</span><ChevronRight size={13} /><strong>{location === '/campaigns' ? 'Campaigns' : activeWorkspaceSection?.label ?? 'Overview'}</strong></div>
              <div className="apw-topbar-right">
                {user && <span className="apw-working-as">Working as <strong>{user.name.split(' ')[0]}</strong></span>}
                <span className={`apw-channel-state ${mysqlSetupNeeded ? 'apw-channel-setup' : isLivePublishingRoute ? 'apw-channel-live' : ''}`}><span />{mysqlSetupNeeded ? 'Workspace setup needed' : isLivePublishingRoute ? 'Meta publishing' : 'Channels not connected'}</span>
              </div>
            </header>
            <div className="apw-content apw-auth-content">
              {mysqlSetupNeeded && <div className="apw-auth-banner" role="status"><CircleHelp size={15} /><span>{messageFrom(current.error ?? csrf.error, 'Connect your new MySQL database details to enable this workspace.')}</span></div>}
            <RoutedErrorBoundary>
              <Switch>
                <Route path="/">
                  {current.isLoading ? <WorkspaceLoading /> : user ? <DashboardPage /> : <Unauthenticated currentError={current.isError && httpStatus(current.error) !== 401 ? messageFrom(current.error, 'We couldn’t check your session. Please sign in to continue.') : null} />}
                </Route>
                <Route path="/campaigns">
                  {current.isLoading ? <WorkspaceLoading /> : user ? <CampaignsPage /> : <Unauthenticated currentError={current.isError && httpStatus(current.error) !== 401 ? messageFrom(current.error, 'We couldn’t check your session. Please sign in to continue.') : null} />}
                </Route>
                <Route path="/connections">
                  {current.isLoading ? <WorkspaceLoading /> : user ? <MetaChannelsPage /> : <Unauthenticated currentError={current.isError && httpStatus(current.error) !== 401 ? messageFrom(current.error, 'We couldn’t check your session. Please sign in to continue.') : null} />}
                </Route>
                <Route path="/planner">
                  {current.isLoading ? <WorkspaceLoading /> : user ? <PublishingPlannerPage initialAiDraft={plannerDraft} onInitialAiDraftLoaded={clearPlannerDraft} /> : <Unauthenticated currentError={current.isError && httpStatus(current.error) !== 401 ? messageFrom(current.error, 'We couldn’t check your session. Please sign in to continue.') : null} />}
                </Route>
                <Route>
                  {current.isLoading ? (
                    <WorkspaceLoading />
                  ) : user && embeddedSection ? (
                    <PreviewWorkspace
                      embedded
                      initialSection={embeddedSection.id}
                      onAiCreativeApproved={handleAiCreativeApproved}
                      onSectionChange={(next) => {
                        const destination = workspaceSections.find((section) => section.id === next)?.path;
                        setLocation(destination ?? '/');
                      }}
                    />
                  ) : user ? (
                    <NotFound />
                  ) : (
                    <Unauthenticated currentError={current.isError && httpStatus(current.error) !== 401 ? messageFrom(current.error, 'We couldn’t check your session. Please sign in to continue.') : null} />
                  )}
                </Route>
              </Switch>
            </RoutedErrorBoundary>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function WorkspaceLoading() {
  return <div className="apw-page apw-page-enter" aria-label="Loading workspace"><div className="apw-skeleton-line apw-skeleton-kicker" /><div className="apw-skeleton-line apw-skeleton-title" /><div className="apw-skeleton-grid"><div /><div /><div /></div><div className="apw-skeleton-panel" /></div>;
}

function Unauthenticated({ currentError }: { currentError: string | null }) {
  const [location] = useLocation();
  return (
    <div className="page-enter mx-auto flex max-w-6xl flex-col px-6 pb-12 pt-14 md:px-10 md:pt-20">
      <div className="max-w-[650px]">
        <p className="section-kicker"><span className="kicker-line" />Your business, in motion</p>
        <h1 className="mt-5 font-display text-[42px] font-extrabold leading-[1.05] tracking-[-.055em] text-[#252b38] md:text-[62px]">A clear view of<br /><span className="text-[#178366]">what’s next.</span></h1>
        <p className="mt-6 max-w-[470px] text-[15px] leading-7 text-[#72777b]">A quieter place to shape your social campaigns. Sign in to pick up where your business left off.</p>
        {currentError && <div className="mt-6 rounded-xl border border-[#e5c6b7] bg-[#fff4ed] px-4 py-3 text-sm text-[#99573b]" role="alert" data-testid="status-session-error">{currentError}</div>}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className="button-primary" data-testid="link-start-sign-in">Sign in <ArrowRight size={16} /></Link>
          <Link href="/register" className="button-secondary" data-testid="link-create-account">Create an account</Link>
          <Link href="/preview" className="button-secondary" data-testid="link-workspace-preview">Explore the workspace preview <ArrowRight size={15} /></Link>
        </div>
      </div>
      <div className="mt-16 grid max-w-[940px] grid-cols-1 gap-3 border-t border-[#e1dbcf] pt-6 sm:grid-cols-3">
        <div><div className="font-mono text-[10px] uppercase tracking-[.15em] text-[#178366]">01 / Compose</div><p className="mt-2 text-[13px] text-[#777d7f]">Give each idea a place to land.</p></div>
        <div><div className="font-mono text-[10px] uppercase tracking-[.15em] text-[#178366]">02 / Review</div><p className="mt-2 text-[13px] text-[#777d7f]">See the shape of your campaign mix.</p></div>
        <div><div className="font-mono text-[10px] uppercase tracking-[.15em] text-[#178366]">03 / Decide</div><p className="mt-2 text-[13px] text-[#777d7f]">Publish when it feels right, on your terms.</p></div>
      </div>
      <span className="sr-only">{location}</span>
    </div>
  );
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const [location, setLocation] = useLocation();
  const [form, setForm] = useState({ name: '', business: '', email: '', password: '' });
  const [success, setSuccess] = useState(false);
  const client = useQueryClient();
  const csrf = useGetCsrfToken();
  const request: RequestInit = { credentials: 'include', ...(csrf.data?.csrf ? { headers: { 'X-CSRF-Token': csrf.data.csrf } } : {}) };
  const login = useLoginAccount({ request });
  const register = useRegisterAccount({ request });
  const pending = login.isPending || register.isPending;
  const error = login.error || register.error;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(false);
    if (isRegister) {
      const data: RegistrationInput = { name: form.name.trim(), business: form.business.trim(), email: form.email.trim(), password: form.password };
      register.mutate({ data }, { onSuccess: (response) => {
        client.setQueryData(userKey, response);
        setSuccess(true);
        setLocation('/');
      } });
    } else {
      const data: LoginInput = { email: form.email.trim(), password: form.password };
      login.mutate({ data }, { onSuccess: (response) => {
        client.setQueryData(userKey, response);
        setSuccess(true);
        setLocation('/');
      } });
    }
  };
  const setField = (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm((value) => ({ ...value, [field]: event.target.value }));

  return (
    <div className="min-h-[100dvh] md:grid md:grid-cols-[minmax(360px,.92fr)_1.08fr]">
      <section className="relative flex min-h-[310px] flex-col overflow-hidden bg-[#252b38] px-7 py-7 text-[#f2eee4] md:min-h-[100dvh] md:px-12 md:py-10">
        <Link href="/" className="relative z-10 flex w-fit items-center gap-3" data-testid="link-auth-brand">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#18866a]"><Radio size={19} /></span>
          <span className="font-display text-[17px] font-extrabold tracking-[-.04em]">adpilot<span className="text-[#e29369]">.</span></span>
        </Link>
        <div className="relative z-10 mt-auto hidden max-w-[470px] pb-6 md:block">
          <div className="mb-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#80c5a9]"><span className="h-px w-7 bg-[#80c5a9]" />A little more room to think</div>
          <h2 className="font-display text-[48px] font-bold leading-[1.05] tracking-[-.055em]">Make the next<br />good thing <span className="text-[#e29369]">happen.</span></h2>
          <p className="mt-5 max-w-[340px] text-[14px] leading-7 text-[#b9c0c8]">Your campaign workspace keeps the work clear and the decisions yours.</p>
        </div>
        <div className="pointer-events-none absolute -right-28 top-[34%] hidden h-[340px] w-[340px] rounded-full border border-white/[.08] md:block" />
        <div className="pointer-events-none absolute -right-12 top-[40%] hidden h-[210px] w-[210px] rounded-full border border-[#e29369]/20 md:block" />
        <div className="relative z-10 mt-7 flex items-center gap-2 text-[11px] text-[#9ca6b0] md:mt-0"><span className="h-1.5 w-1.5 rounded-full bg-[#71b795]" />Simple, secure business access</div>
      </section>
      <section className="flex min-h-[calc(100dvh-310px)] items-center justify-center px-6 py-12 md:min-h-[100dvh] md:px-10">
        <div className="page-enter w-full max-w-[410px]">
          <div className="font-mono text-[10px] uppercase tracking-[.18em] text-[#178366]">{isRegister ? 'A good place to begin' : 'Welcome back'}</div>
          <h1 className="mt-3 font-display text-[34px] font-extrabold tracking-[-.055em] text-[#252b38]">{isRegister ? 'Set up your workspace' : 'Sign in to AdPilot'}</h1>
          <p className="mt-2 text-[14px] text-[#777d7f]">{isRegister ? 'Create an owner account for your business.' : 'Your campaigns are right where you left them.'}</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            {isRegister && <>
              <label className="field-label">Your name<input required minLength={2} maxLength={160} value={form.name} onChange={setField('name')} autoComplete="name" placeholder="Morgan Lee" className="form-input" data-testid="input-name" /></label>
              <label className="field-label">Business name<input required minLength={2} maxLength={160} value={form.business} onChange={setField('business')} autoComplete="organization" placeholder="Studio Morrow" className="form-input" data-testid="input-business" /></label>
            </>}
            <label className="field-label">Email address<input required type="email" maxLength={254} value={form.email} onChange={setField('email')} autoComplete="email" placeholder="you@yourbusiness.com" className="form-input" data-testid="input-email" /></label>
            <label className="field-label">Password<input required type="password" minLength={isRegister ? 12 : 1} maxLength={256} value={form.password} onChange={setField('password')} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder={isRegister ? 'At least 12 characters' : 'Enter your password'} className="form-input" data-testid="input-password" /></label>
            {error && <div className="rounded-xl border border-[#e3c4b6] bg-[#fff2ec] px-4 py-3 text-[13px] leading-5 text-[#a04e34]" role="alert" data-testid="status-auth-error">{messageFrom(error, 'We could not complete that request. Please try again.')}</div>}
            {csrf.isError && <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e3c4b6] bg-[#fff2ec] px-4 py-3 text-[12px] text-[#a04e34]" role="alert" data-testid="status-csrf-error"><span>{messageFrom(csrf.error, 'Secure sign-in setup failed. Try again before continuing.')}</span><button type="button" onClick={() => void csrf.refetch()} className="shrink-0 font-semibold underline underline-offset-2" data-testid="button-retry-csrf">Retry</button></div>}
            {success && <div className="rounded-xl border border-[#c8dfcf] bg-[#edf5ee] px-4 py-3 text-[13px] text-[#387356]" role="status" data-testid="status-auth-success">You’re signed in. Taking you to your workspace.</div>}
            <button type="submit" disabled={pending || !csrf.data?.csrf} className="button-primary mt-2 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60" data-testid="button-submit-auth">{pending || (!csrf.data?.csrf && csrf.isLoading) ? <LoaderCircle className="animate-spin" size={17} /> : isRegister ? 'Create workspace' : 'Sign in'}{!pending && csrf.data?.csrf && <ArrowRight size={16} />}</button>
          </form>
          <p className="mt-7 text-center text-[13px] text-[#737a7c]">{isRegister ? 'Already have a workspace?' : 'New to AdPilot?'}{' '}
            <Link href={isRegister ? '/login' : '/register'} className="font-semibold text-[#167b62] underline decoration-[#a6cabb] underline-offset-4 hover:text-[#105f4b]" data-testid={isRegister ? 'link-switch-login' : 'link-switch-register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link>
          </p>
          <div className="mt-8 border-t border-[#e6e0d5] pt-4 text-center font-mono text-[9px] uppercase tracking-[.12em] text-[#9a9c97]">Cookie-backed sessions · protected by your business</div>
          <span className="sr-only">{location}</span>
        </div>
      </section>
    </div>
  );
}

function DashboardPage() {
  const summary = useGetDashboardSummary({ request: { credentials: 'include' } });
  const [, setLocation] = useLocation();
  const [retrying, setRetrying] = useState(false);
  const data = summary.data;
  if (summary.isLoading) return <WorkspaceLoading />;
  if (summary.isError || !data) return <ErrorState title="Your overview didn’t load" detail={messageFrom(summary.error, 'The dashboard is temporarily unavailable.')} onRetry={() => { setRetrying(true); void summary.refetch().finally(() => setRetrying(false)); }} retrying={retrying} />;
  const stats = [
    { label: 'All campaigns', value: data.total, icon: Radio, color: 'neutral', detail: 'Across your workspace' },
    { label: 'Working drafts', value: data.draft, icon: FileText, color: 'green', detail: 'Ideas still taking shape' },
    { label: 'Scheduled', value: data.scheduled, icon: ArrowUpRight, color: 'ochre', detail: 'No publishing connection' },
    { label: 'Published', value: data.published, icon: Send, color: 'rose', detail: 'Recorded in your workspace' },
  ];
  return (
    <div className="apw-page apw-page-enter" data-testid="page-overview">
      <div className="apw-heading">
        <div>
          <div className="apw-eyebrow"><span />Your business, in motion</div>
          <h1>A clear view of what’s next.</h1>
          <p>A grounded place to shape campaigns, review the work and stay in control.</p>
        </div>
        <div className="apw-heading-actions"><button onClick={() => setLocation('/campaigns')} className="apw-button apw-button-primary" data-testid="button-create-campaign"><Plus size={16} />New campaign draft</button></div>
      </div>

      <div className="apw-auth-overview-grid">
        <div className="apw-auth-overview-main">
          <div className="apw-auth-stat-grid">
            {stats.map(({ label, value, icon: Icon, color, detail }) => (
              <div key={label} className={`apw-stat-card apw-stat-${color}`} data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}>
                <div><span>{label}</span><Icon size={17} /></div>
                <strong>{value}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </div>
          <section className="apw-panel apw-recent-panel">
            <div className="apw-panel-head">
              <div><div className="apw-overline">THE WORKING TABLE</div><h2>Recent campaigns</h2></div>
              <Link href="/campaigns" className="apw-text-action" data-testid="link-view-campaigns">View all <ArrowRight size={14} /></Link>
            </div>
            {data.recentCampaigns.length ? <div>
              {data.recentCampaigns.slice(0, 5).map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} />)}
            </div> : <EmptyState variant="recent" onCreate={() => setLocation('/campaigns')} />}
          </section>
        </div>
        <aside className="apw-auth-overview-side">
          <section className="apw-next-card">
            <div className="apw-next-card-top"><span>THE NEXT SMALL STEP</span><FileText size={16} /></div>
            <h2>Begin with a useful thought.</h2>
            <p>Save the core idea first. You can refine the words whenever you’re ready.</p>
            <button onClick={() => setLocation('/campaigns')} data-testid="button-start-draft">Start a campaign draft <ArrowRight size={15} /></button>
            <div className="apw-loop loop-one" /><div className="apw-loop loop-two" />
          </section>
          <section className="apw-connection-card" aria-label="Channel connection status">
            <div className="apw-overline">CHANNELS</div>
            <div className="apw-connection-inline"><span className="apw-connection-dot" /><strong>Not connected</strong><span>Inactive</span></div>
            <p>Campaign drafts stay in your workspace. Publishing and external channel actions are unavailable.</p>
          </section>
          <div className="apw-quiet-quote"><span>“</span><p>Clear is kind. Keep the work useful and yours.</p><small>ADPILOT WORKING PRINCIPLE</small></div>
        </aside>
      </div>
      <div className="apw-bottom-ribbon">
        <span className="apw-ribbon-mark"><Check size={14} /></span>
        <span><strong>Control stays with you.</strong> Campaign counts and recent work reflect your business records.</span>
        <Link href="/campaigns" className="apw-ribbon-link">Review campaigns <ArrowRight size={14} /></Link>
      </div>
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  return (
    <div className="apw-auth-campaign-row" data-testid={`row-campaign-${campaign.id}`}>
      <div className="apw-auth-campaign-icon"><FileText size={17} /></div>
      <div className="apw-auth-campaign-info"><strong data-testid={`text-campaign-title-${campaign.id}`}>{campaign.title}</strong><p>{campaign.caption || 'No caption yet'}{campaign.hashtags ? ` · ${campaign.hashtags}` : ''}</p></div>
      <div className="apw-auth-campaign-meta"><StatusBadge status={campaign.status} /><time>{formatDate(campaign.createdAt)}</time></div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`} data-testid={`status-badge-${status}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status}</span>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function EmptyState({ variant, onCreate }: { variant: 'recent' | 'campaigns'; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" data-testid={`empty-${variant}`}>
      <div className="relative flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#e8eee7] text-[#59806c]"><FileText size={21} /><span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#e6966d] text-white"><Plus size={12} /></span></div>
      <h3 className="mt-4 font-display text-[17px] font-bold tracking-[-.025em] text-[#343b42]">{variant === 'recent' ? 'Nothing in the queue yet' : 'A fresh page'}</h3>
      <p className="mt-1 max-w-[330px] text-[12px] leading-5 text-[#858985]">{variant === 'recent' ? 'Start with a draft. It will show up here as your campaign ideas take shape.' : 'Your campaigns will live here. Make the first one a draft and build from there.'}</p>
      <button onClick={onCreate} className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#cbd9cd] px-4 py-2 text-[11px] font-semibold text-[#3b715b] hover:bg-[#edf3ed]" data-testid="button-empty-create">Create a draft <ArrowRight size={13} /></button>
    </div>
  );
}

function ErrorState({ title, detail, onRetry, retrying }: { title: string; detail: string; onRetry: () => void; retrying: boolean }) {
  return <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-[#e5c7b8] bg-[#fff8f3] p-7" role="alert" data-testid="status-data-error"><div className="font-mono text-[10px] uppercase tracking-[.16em] text-[#ad6345]">A momentary pause</div><h2 className="mt-2 font-display text-[22px] font-bold text-[#383a3a]">{title}</h2><p className="mt-2 text-[13px] leading-6 text-[#797672]">{detail}</p><button onClick={onRetry} disabled={retrying} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#315f50] px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-[#274d40] disabled:opacity-60" data-testid="button-retry">{retrying ? <LoaderCircle className="animate-spin" size={15} /> : <ArrowDownRight size={15} />}Try again</button></div>;
}

function CampaignsPage() {
  const csrf = useGetCsrfToken();
  const list = useListCampaigns({ request: { credentials: 'include' } });
  const create = useCreateCampaign({ request: { credentials: 'include', headers: csrf.data?.csrf ? { 'X-CSRF-Token': csrf.data.csrf } : {} } });
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [retrying, setRetrying] = useState(false);
  const campaigns = list.data?.campaigns ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return campaigns;
    return campaigns.filter((campaign) => [campaign.title, campaign.caption, campaign.hashtags].some((value) => value?.toLowerCase().includes(term)));
  }, [campaigns, search]);

  const saveCampaign = (input: CampaignInput) => {
    create.mutate({ data: input }, {
      onSuccess: (campaign) => {
        queryClient.setQueryData(campaignsKey, (old: { campaigns: Campaign[] } | undefined) => ({ campaigns: [campaign, ...(old?.campaigns ?? []).filter((item) => item.id !== campaign.id)] }));
        queryClient.setQueryData(summaryKey, (old: { total: number; draft: number; scheduled: number; published: number; recentCampaigns: Campaign[] } | undefined) => old ? ({
          ...old,
          total: old.total + 1,
          draft: old.draft + 1,
          recentCampaigns: [campaign, ...old.recentCampaigns.filter((item) => item.id !== campaign.id)].slice(0, 5),
        }) : old);
        setCreateOpen(false);
      },
    });
  };

  if (list.isLoading) return <WorkspaceLoading />;
  if (list.isError) return <ErrorState title="Campaigns didn’t come through" detail={messageFrom(list.error, 'We couldn’t load your campaign list.')} onRetry={() => { setRetrying(true); void list.refetch().finally(() => setRetrying(false)); }} retrying={retrying} />;

  return (
    <div className="apw-page apw-page-enter apw-auth-campaigns">
      <div className="apw-heading">
        <div>
          <div className="apw-eyebrow"><span />Your working drafts</div>
          <h1>Campaigns, gathered.</h1>
          <p>A clear list of what’s being shaped, what’s planned, and what’s already recorded in your workspace.</p>
        </div>
        <div className="apw-heading-actions"><button onClick={() => setCreateOpen(true)} className="apw-button apw-button-primary" data-testid="button-new-campaign"><Plus size={16} />New campaign draft</button></div>
      </div>
      <div className="apw-campaign-tools">
        <div className="apw-campaign-counts"><span>All <strong>{campaigns.length}</strong></span><span>Drafts <strong>{campaigns.filter((item) => item.status === 'draft').length}</strong></span><span>Scheduled <strong>{campaigns.filter((item) => item.status === 'scheduled').length}</strong></span><span>Published <strong>{campaigns.filter((item) => item.status === 'published').length}</strong></span></div>
        <label className="apw-campaign-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a campaign" data-testid="input-search-campaigns" /></label>
      </div>
      {filtered.length ? <div className="apw-panel apw-campaign-list">
        <div className="apw-campaign-table-head"><span>Campaign</span><span>Status</span><span>Created</span></div>
        {filtered.map((campaign) => <CampaignListRow key={campaign.id} campaign={campaign} />)}
      </div> : campaigns.length ? <div className="mt-6 rounded-2xl border border-dashed border-[#d8d2c6] bg-[#faf8f2] p-10 text-center" data-testid="empty-search-results"><p className="font-display text-lg font-bold text-[#3d4447]">No matches, yet.</p><p className="mt-1 text-[12px] text-[#858985]">Try another word from the campaign title or caption.</p></div> : <div className="mt-4 rounded-[18px] border border-[#e4ded2] bg-[#fbfaf6]"><EmptyState variant="campaigns" onCreate={() => setCreateOpen(true)} /></div>}
      <div className="apw-campaign-footer"><Check size={14} />Drafts are saved to your business workspace. Channels are not connected.</div>
      {createOpen && <CreateCampaignDialog onClose={() => setCreateOpen(false)} onCreate={saveCampaign} pending={create.isPending} error={create.error} csrfReady={Boolean(csrf.data?.csrf)} csrfError={csrf.isError} onRetryCsrf={() => void csrf.refetch()} />}
    </div>
  );
}

function CampaignListRow({ campaign }: { campaign: Campaign }) {
  return (
    <div className="apw-auth-campaign-row apw-list-campaign-row" data-testid={`row-campaign-${campaign.id}`}>
      <div className="apw-auth-campaign-icon"><FileText size={17} /></div>
      <div className="apw-auth-campaign-info">
        <strong data-testid={`text-campaign-title-${campaign.id}`}>{campaign.title}</strong>
        <p>{campaign.caption || 'No caption yet'}{campaign.hashtags ? ` · ${campaign.hashtags}` : ''}</p>
      </div>
      <div className="apw-auth-campaign-meta"><StatusBadge status={campaign.status} /><time>{formatDate(campaign.createdAt)}</time></div>
    </div>
  );
}

function CreateCampaignDialog({ onClose, onCreate, pending, error, csrfReady, csrfError, onRetryCsrf }: { onClose: () => void; onCreate: (input: CampaignInput) => void; pending: boolean; error: unknown; csrfReady: boolean; csrfError: boolean; onRetryCsrf: () => void }) {
  const [form, setForm] = useState({ title: '', caption: '', hashtags: '' });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onCreate({ title: form.title.trim(), caption: form.caption.trim(), hashtags: form.hashtags.trim() });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#1c222d]/55 px-4 py-8" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }} data-testid="dialog-create-campaign">
      <section className="page-enter relative w-full max-w-[550px] rounded-[22px] border border-[#ebe4d8] bg-[#fbfaf6] p-6 shadow-[0_24px_90px_rgba(25,31,39,.24)] md:p-8" role="dialog" aria-modal="true" aria-labelledby="campaign-dialog-title">
        <button onClick={onClose} disabled={pending} className="absolute right-5 top-5 rounded-lg p-2 text-[#7f8582] hover:bg-[#eeeae1] disabled:opacity-50" aria-label="Close campaign form" data-testid="button-close-campaign-dialog"><X size={18} /></button>
        <div className="font-mono text-[9px] uppercase tracking-[.17em] text-[#218066]">Campaign draft / 01</div>
        <h2 id="campaign-dialog-title" className="mt-2 font-display text-[27px] font-extrabold tracking-[-.05em] text-[#272e38]">Start with the idea.</h2>
        <p className="mt-2 max-w-[410px] text-[13px] leading-6 text-[#7c817e]">Add the core thought now. You can shape the words as your plan comes together.</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="field-label">Campaign title<input required minLength={2} maxLength={180} autoFocus value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="A title that says what this is about" className="form-input" data-testid="input-campaign-title" /></label>
          <label className="field-label">Caption<textarea maxLength={10000} rows={4} value={form.caption} onChange={(event) => setForm((current) => ({ ...current, caption: event.target.value }))} placeholder="The words you’re considering sharing…" className="form-input resize-y py-3 leading-6" data-testid="input-campaign-caption" /></label>
          <label className="field-label">Hashtags<span className="ml-1 font-normal normal-case tracking-normal text-[#a1a29d]">optional</span><input maxLength={2000} value={form.hashtags} onChange={(event) => setForm((current) => ({ ...current, hashtags: event.target.value }))} placeholder="#yourbrand #whatsnew" className="form-input" data-testid="input-campaign-hashtags" /></label>
          {Boolean(error) && <div className="rounded-xl border border-[#e3c4b6] bg-[#fff2ec] px-4 py-3 text-[13px] leading-5 text-[#a04e34]" role="alert" data-testid="status-create-error">{messageFrom(error, 'This draft could not be saved. Please try again.')}</div>}
          {csrfError && <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e3c4b6] bg-[#fff2ec] px-4 py-3 text-[12px] text-[#a04e34]" role="alert" data-testid="status-create-csrf-error"><span>Secure save setup failed. Retry to continue.</span><button type="button" onClick={onRetryCsrf} className="shrink-0 font-semibold underline underline-offset-2" data-testid="button-retry-create-csrf">Retry</button></div>}
          <div className="flex flex-col-reverse gap-3 border-t border-[#e8e2d8] pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} className="button-secondary justify-center disabled:opacity-50" data-testid="button-cancel-campaign">Not now</button>
            <button type="submit" disabled={pending || !csrfReady || form.title.trim().length < 2} className="button-primary justify-center disabled:cursor-not-allowed disabled:opacity-55" data-testid="button-save-campaign">{pending || !csrfReady ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}{pending ? 'Saving draft' : !csrfReady ? 'Preparing secure save' : 'Save draft'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Switch>
            <Route path="/preview"><PreviewWorkspace /></Route>
            <Route component={AppFrame} />
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
