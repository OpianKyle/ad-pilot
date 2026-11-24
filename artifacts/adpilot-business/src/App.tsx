import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
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
  Sparkles,
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
  const queryClient = useQueryClient();
  const user = current.data?.user;
  const mysqlSetupNeeded =
    httpStatus(current.error) === 503 || httpStatus(csrf.error) === 503;
  const isAuthRoute = location === '/login' || location === '/register';

  useEffect(() => {
    setMobileNav(false);
  }, [location]);

  const signOut = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(userKey, undefined);
        queryClient.removeQueries({ queryKey: summaryKey });
        queryClient.removeQueries({ queryKey: campaignsKey });
        setLocation('/login');
      },
    });
  };

  return (
    <div className="min-h-[100dvh] bg-[#f6f4ee] text-[#272c38]">
      {isAuthRoute ? (
        <Switch>
          <Route path="/login"><AuthPage mode="login" /></Route>
          <Route path="/register"><AuthPage mode="register" /></Route>
          <Route component={NotFound} />
        </Switch>
      ) : (
        <div className="min-h-[100dvh] md:flex">
          <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-[#252b38] px-5 pb-5 pt-6 text-[#e8e9e4] transition-transform md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="flex items-center justify-between px-2">
              <Link href="/" className="flex items-center gap-3" data-testid="link-brand-home">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1c8b6d] text-white"><Radio size={19} strokeWidth={2.3} /></span>
                <span className="font-display text-[17px] font-extrabold tracking-[-.04em]">adpilot<span className="text-[#e29369]">.</span></span>
              </Link>
              <button onClick={() => setMobileNav(false)} className="rounded-lg p-2 text-[#aeb5be] hover:bg-white/10 md:hidden" aria-label="Close navigation" data-testid="button-close-navigation"><X size={19} /></button>
            </div>
            <div className="mt-12 px-3 font-mono text-[10px] uppercase tracking-[.18em] text-[#87909e]">Workspace</div>
            <nav className="mt-3 space-y-1">
              <Link href="/" className={`nav-item ${location === '/' ? 'nav-active' : ''}`} data-testid="link-dashboard"><LayoutDashboard size={17} /><span>Overview</span></Link>
              <Link href="/campaigns" className={`nav-item ${location === '/campaigns' ? 'nav-active' : ''}`} data-testid="link-campaigns"><FileText size={17} /><span>Campaigns</span></Link>
            </nav>
            <div className="mt-auto">
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/[.045] p-4">
                <div className="mb-2 flex items-center gap-2 text-[#df9a72]"><CircleHelp size={15} /><span className="font-mono text-[9px] uppercase tracking-[.16em]">A steady hand</span></div>
                <p className="text-[12px] leading-[1.65] text-[#b8bec6]">Draft your next post here. You stay in control of what goes live.</p>
              </div>
              {user ? (
                <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d9e5db] font-display text-sm font-bold text-[#285948]">{user.name.trim().slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-[#f2f1ed]" data-testid="text-account-name">{user.name}</div>
                    <div className="truncate text-[11px] text-[#a3acb7]">{user.email}</div>
                  </div>
                  <button onClick={signOut} disabled={logout.isPending || !csrf.data?.csrf} title="Sign out" aria-label="Sign out" data-testid="button-sign-out" className="rounded-lg p-2 text-[#b5bdc5] transition hover:bg-white/10 hover:text-white disabled:opacity-50">
                    {logout.isPending ? <LoaderCircle className="animate-spin" size={16} /> : <LogOut size={16} />}
                  </button>
                </div>
              ) : (
                <div className="border-t border-white/10 pt-4"><Link href="/login" className="nav-item" data-testid="link-sign-in"><LogOut size={17} /><span>Sign in</span></Link></div>
              )}
            </div>
          </aside>

          {mobileNav && <button aria-label="Close navigation overlay" className="fixed inset-0 z-30 bg-[#1b202b]/45 md:hidden" onClick={() => setMobileNav(false)} data-testid="button-navigation-overlay" />}
          <main className="min-h-[100dvh] min-w-0 flex-1 md:ml-[260px]">
            <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#e7e2d7] bg-[#f6f4ee]/95 px-5 backdrop-blur md:px-10">
              <button className="rounded-lg p-2 text-[#535b68] hover:bg-[#eae7de] md:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)} data-testid="button-open-navigation"><Menu size={20} /></button>
              <div className="hidden font-mono text-[10px] uppercase tracking-[.16em] text-[#8a8b87] md:block">Business workspace <span className="mx-2 text-[#c1b9a9]">/</span><span className="text-[#4f5961]">{location === '/campaigns' ? 'Campaigns' : 'Overview'}</span></div>
              <div className="ml-auto flex items-center gap-3">
                {user && <span className="hidden text-[12px] text-[#737b82] sm:block">Working as <strong className="font-semibold text-[#3b4149]">{user.name.split(' ')[0]}</strong></span>}
                 <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[.08em] ${mysqlSetupNeeded ? 'border-[#e5c6b7] bg-[#fff4ed] text-[#99573b]' : 'border-[#d7e6dc] bg-[#e7f0e8] text-[#3d755e]'}`}><span className={`h-1.5 w-1.5 rounded-full ${mysqlSetupNeeded ? 'bg-[#c27856]' : 'bg-[#3c9b72]'}`} />{mysqlSetupNeeded ? 'Setup needed' : 'Workspace ready'}</span>
              </div>
            </header>
            <RoutedErrorBoundary>
              <Switch>
                <Route path="/">
                  {current.isLoading ? <WorkspaceLoading /> : user ? <DashboardPage /> : <Unauthenticated currentError={current.isError && httpStatus(current.error) !== 401 ? messageFrom(current.error, 'We couldn’t check your session. Please sign in to continue.') : null} />}
                </Route>
                <Route path="/campaigns">
                  {current.isLoading ? <WorkspaceLoading /> : user ? <CampaignsPage /> : <Unauthenticated currentError={current.isError && httpStatus(current.error) !== 401 ? messageFrom(current.error, 'We couldn’t check your session. Please sign in to continue.') : null} />}
                </Route>
                <Route component={NotFound} />
              </Switch>
            </RoutedErrorBoundary>
          </main>
        </div>
      )}
    </div>
  );
}

function WorkspaceLoading() {
  return <div className="page-enter mx-auto max-w-6xl px-6 py-12 md:px-10"><div className="h-3 w-28 animate-pulse rounded bg-[#ded9ce]" /><div className="mt-5 h-9 w-64 animate-pulse rounded bg-[#e5e0d6]" /><div className="mt-10 grid gap-4 sm:grid-cols-3"><div className="h-32 animate-pulse rounded-2xl bg-[#e8e3d9]" /><div className="h-32 animate-pulse rounded-2xl bg-[#e8e3d9]" /><div className="h-32 animate-pulse rounded-2xl bg-[#e8e3d9]" /></div></div>;
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
    { label: 'All campaigns', value: data.total, icon: Radio, color: 'teal' },
    { label: 'Drafts', value: data.draft, icon: FileText, color: 'clay' },
    { label: 'Scheduled', value: data.scheduled, icon: ArrowUpRight, color: 'gold' },
    { label: 'Published', value: data.published, icon: Send, color: 'blue' },
  ];
  return (
    <div className="page-enter mx-auto max-w-[1240px] px-5 pb-14 pt-9 md:px-10 md:pt-12">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="section-kicker"><span className="kicker-line" />Business overview</p>
          <h1 className="mt-3 font-display text-[36px] font-extrabold leading-tight tracking-[-.055em] text-[#252b38] md:text-[44px]">Good work, in progress.</h1>
          <p className="mt-2 text-[14px] text-[#777d7f]">A grounded look at what your business is putting out there.</p>
        </div>
        <button onClick={() => setLocation('/campaigns')} className="button-primary self-start sm:self-auto" data-testid="button-create-campaign"><Plus size={17} />New campaign draft</button>
      </div>

      <div className="mt-9 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }, index) => (
          <div key={label} className={`stat-card stat-${color}`} data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}>
            <div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[.14em] text-[#72797a]">{label}</span><Icon size={15} className="text-[#72827e]" /></div>
            <div className="mt-6 flex items-end justify-between"><span className="font-display text-[36px] font-bold leading-none tracking-[-.05em] text-[#292f39]">{value}</span><span className="font-mono text-[10px] text-[#9a9d98]">0{index + 1}</span></div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-[1.65fr_.85fr]">
        <section className="overflow-hidden rounded-[20px] border border-[#e4ded2] bg-[#fbfaf6]">
          <div className="flex items-center justify-between border-b border-[#eae5dc] px-5 py-5 md:px-7">
            <div><p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#168065]">The latest</p><h2 className="mt-1 font-display text-[20px] font-bold tracking-[-.04em]">Recent campaigns</h2></div>
            <Link href="/campaigns" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#217d65] hover:text-[#145b49]" data-testid="link-view-campaigns">All campaigns <ChevronRight size={15} /></Link>
          </div>
          {data.recentCampaigns.length ? <div className="divide-y divide-[#eee9df]">
            {data.recentCampaigns.slice(0, 5).map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} />)}
          </div> : <EmptyState variant="recent" onCreate={() => setLocation('/campaigns')} />}
        </section>
        <section className="relative overflow-hidden rounded-[20px] bg-[#dfebe2] p-6 md:p-7">
          <div className="relative z-10">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c7dfd0] text-[#16745b]"><Sparkles size={17} /></div>
            <div className="mt-7 font-mono text-[9px] uppercase tracking-[.17em] text-[#50806e]">The next small step</div>
            <h2 className="mt-2 max-w-[230px] font-display text-[25px] font-bold leading-[1.13] tracking-[-.045em] text-[#283c35]">A good draft starts with one clear thought.</h2>
            <p className="mt-3 max-w-[250px] text-[13px] leading-6 text-[#667b72]">Capture the idea while it’s fresh. Refine it whenever you’re ready.</p>
            <button onClick={() => setLocation('/campaigns')} className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#a6c5b2] bg-[#f2f6f0] px-4 py-2.5 text-[12px] font-semibold text-[#315d4c] transition hover:bg-white" data-testid="button-start-draft">Start a draft <ArrowRight size={14} /></button>
          </div>
          <div className="pointer-events-none absolute -bottom-16 -right-8 h-56 w-56 rounded-full border border-[#9ebda9]/35" />
          <div className="pointer-events-none absolute -bottom-8 -right-2 h-36 w-36 rounded-full border border-[#9ebda9]/35" />
        </section>
      </div>
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[#f7f4ed] md:px-7" data-testid={`row-campaign-${campaign.id}`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#edf0e9] text-[#547365]"><FileText size={17} /></div>
      <div className="min-w-0 flex-1"><h3 className="truncate text-[13px] font-semibold text-[#353b43]" data-testid={`text-campaign-title-${campaign.id}`}>{campaign.title}</h3><p className="mt-1 truncate text-[11px] text-[#92948f]">{campaign.caption || 'No caption yet'}{campaign.hashtags ? ` · ${campaign.hashtags}` : ''}</p></div>
      <div className="hidden text-right sm:block"><StatusBadge status={campaign.status} /><p className="mt-1.5 font-mono text-[9px] text-[#a0a19b]">{formatDate(campaign.createdAt)}</p></div>
      <div className="sm:hidden"><StatusBadge status={campaign.status} /></div>
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
    <div className="page-enter mx-auto max-w-[1240px] px-5 pb-14 pt-9 md:px-10 md:pt-12">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="section-kicker"><span className="kicker-line" />Your working drafts</p>
          <h1 className="mt-3 font-display text-[38px] font-extrabold leading-tight tracking-[-.055em] text-[#252b38] md:text-[46px]">Campaigns, gathered.</h1>
          <p className="mt-2 max-w-[490px] text-[14px] leading-6 text-[#777d7f]">A clear list of what’s being shaped, what’s planned, and what’s already out in the world.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="button-primary self-start md:self-auto" data-testid="button-new-campaign"><Plus size={17} />New campaign</button>
      </div>
      <div className="mt-9 flex flex-col gap-4 border-b border-[#e2ddd2] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-6 font-mono text-[10px] uppercase tracking-[.12em] text-[#92948e]"><span className="text-[#26745f]">All <span className="ml-1 text-[#434a4d]">{campaigns.length}</span></span><span>Drafts <span className="ml-1 text-[#434a4d]">{campaigns.filter((item) => item.status === 'draft').length}</span></span></div>
        <label className="relative block w-full sm:w-[260px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#969a95]" size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a campaign" className="h-10 w-full rounded-full border border-[#e3ded3] bg-[#fbfaf6] pl-9 pr-4 text-[12px] text-[#40474c] outline-none transition placeholder:text-[#a3a59f] focus:border-[#8db4a2] focus:ring-2 focus:ring-[#178366]/10" data-testid="input-search-campaigns" /></label>
      </div>
      {filtered.length ? <div className="mt-3 overflow-hidden rounded-[18px] border border-[#e4ded2] bg-[#fbfaf6]">
        <div className="hidden grid-cols-[1fr_130px_100px] border-b border-[#eae5dc] px-6 py-3 font-mono text-[9px] uppercase tracking-[.14em] text-[#969993] sm:grid"><span>Campaign</span><span>Status</span><span className="text-right">Created</span></div>
        <div className="divide-y divide-[#eee9df]">
          {filtered.map((campaign) => <div key={campaign.id} className="flex items-center gap-4 px-4 py-4 sm:grid sm:grid-cols-[1fr_130px_100px] sm:px-6" data-testid={`row-campaign-${campaign.id}`}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#edf0e9] text-[#547365]"><FileText size={17} /></div>
              <div className="min-w-0"><h2 className="truncate text-[13px] font-semibold text-[#353b43]" data-testid={`text-campaign-title-${campaign.id}`}>{campaign.title}</h2><p className="mt-1 truncate text-[11px] text-[#92948f]">{campaign.caption || 'No caption yet'}{campaign.hashtags ? ` · ${campaign.hashtags}` : ''}</p></div>
            </div>
            <div className="hidden sm:block"><StatusBadge status={campaign.status} /></div>
            <div className="hidden text-right font-mono text-[10px] text-[#92948f] sm:block">{formatDate(campaign.createdAt)}</div>
            <div className="sm:hidden"><StatusBadge status={campaign.status} /></div>
          </div>)}
        </div>
      </div> : campaigns.length ? <div className="mt-6 rounded-2xl border border-dashed border-[#d8d2c6] bg-[#faf8f2] p-10 text-center" data-testid="empty-search-results"><p className="font-display text-lg font-bold text-[#3d4447]">No matches, yet.</p><p className="mt-1 text-[12px] text-[#858985]">Try another word from the campaign title or caption.</p></div> : <div className="mt-4 rounded-[18px] border border-[#e4ded2] bg-[#fbfaf6]"><EmptyState variant="campaigns" onCreate={() => setCreateOpen(true)} /></div>}
      <div className="mt-5 flex items-center gap-2 text-[11px] text-[#959791]"><Check size={14} className="text-[#4d9676]" />Drafts are saved to your business workspace.</div>
      {createOpen && <CreateCampaignDialog onClose={() => setCreateOpen(false)} onCreate={saveCampaign} pending={create.isPending} error={create.error} csrfReady={Boolean(csrf.data?.csrf)} csrfError={csrf.isError} onRetryCsrf={() => void csrf.refetch()} />}
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
          <AppFrame />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
