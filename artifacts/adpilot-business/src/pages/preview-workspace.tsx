import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Archive,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  CreditCard,
  FileText,
  ImagePlus,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  Save,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { Link } from 'wouter';
import { workspaceSections, type PreviewSection } from '@/lib/workspace-sections';
import AiCreativeWorkflow from '@/components/ai-creative-workflow';
import type { ApprovedAiCreative } from '@/lib/creative-handoff';
type Section = PreviewSection;

type DraftStatus = 'draft' | 'scheduled' | 'archived';
type Draft = {
  id: string;
  title: string;
  caption: string;
  direction: string;
  format: string;
  status: DraftStatus;
  createdAt: string;
  scheduledAt?: string;
  variation: number;
  creativeOptions?: { quality: string; style: string; source: string; scene: string };
};
type Brief = {
  id: string;
  title: string;
  audience: string;
  offer: string;
  status: 'Planning' | 'Ready';
  autopilot: boolean;
};
type ActivityItem = { id: string; label: string; detail: string; at: string };
type BrandSettings = {
  business: string;
  adviser: string;
  voice: string;
  audience: string;
  facts: string;
  offer: string;
  cta: string;
  destination: string;
  disclosure: string;
  brandColor: string;
  timezone: string;
  postingTime: string;
  facebookUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
  channels: string[];
  creativeDirection: string;
  imageFormat: string;
  imageQuality: string;
  visualStyle: string;
  sceneNotes: string;
};
type PaidPlan = {
  name: string;
  creativeId: string;
  objective: string;
  audience: string;
  dailyBudget: string;
  countries: string;
  startDate: string;
  endDate: string;
  destination: string;
  specialCategory: string;
  categoryConfirmed: boolean;
};

const directions = [
  'Editorial photo + headline',
  'Bold typographic poster',
  'Still life / close-up',
  'Three-point checklist',
  'Question-led creative',
  'Clean offer card',
  'Lifestyle editorial',
  'Your real photograph',
  'Family goals',
  'Next chapter',
  'Business owner at work',
  'Life milestone',
];
const sections = workspaceSections;

function localDateTime(daysFromToday: number, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hour, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function localDateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

const initialSettings: BrandSettings = {
  business: 'Northline Financial',
  adviser: 'Morgan Ellis',
  voice: 'Warm, clear and confident',
  audience: 'People building a more considered plan for their next chapter',
  facts: 'Independent advice, explained in plain language. Advice is tailored to each person.',
  offer: 'A first conversation to understand what matters to you.',
  cta: 'Start a conversation',
  destination: 'https://northline.example/advice',
  disclosure: 'Advice is provided after considering your individual circumstances.',
  brandColor: '#315f50',
  timezone: 'Africa/Johannesburg',
  postingTime: '09:00',
  facebookUrl: '',
  instagramUrl: '',
  linkedinUrl: '',
  channels: ['facebook'],
  creativeDirection: 'rotate',
  imageFormat: 'square',
  imageQuality: 'high',
  visualStyle: 'natural',
  sceneNotes: '',
};

const starterDrafts: Draft[] = [
  {
    id: 'sample-01',
    title: 'Make space for the next chapter',
    caption: 'Good plans start with a conversation about what matters most. Let’s make room for the things you’re looking forward to.',
    direction: 'Editorial photo + headline',
    format: 'square',
    status: 'draft',
    createdAt: localDateTime(-1, 8),
    variation: 1,
  },
  {
    id: 'sample-02',
    title: 'A clearer view of your options',
    caption: 'There is no one-size-fits-all path. A thoughtful review can help bring your choices into focus.',
    direction: 'Question-led creative',
    format: 'portrait',
    status: 'scheduled',
    createdAt: localDateTime(-3, 12),
    scheduledAt: localDateTime(2),
    variation: 1,
  },
  {
    id: 'sample-03',
    title: 'Small steps, thoughtfully taken',
    caption: 'You do not have to have every answer today. Start with the question you have been carrying.',
    direction: 'Three-point checklist',
    format: 'square',
    status: 'draft',
    createdAt: localDateTime(-5, 10),
    variation: 1,
  },
];
const starterBriefs: Brief[] = [
  {
    id: 'brief-01',
    title: 'A first conversation',
    audience: 'People considering independent financial advice',
    offer: 'A complimentary introductory conversation',
    status: 'Ready',
    autopilot: false,
  },
  {
    id: 'brief-02',
    title: 'Plan for what comes next',
    audience: 'Professionals approaching a career or life change',
    offer: 'A thoughtful review of priorities and options',
    status: 'Planning',
    autopilot: false,
  },
];
const initialActivity: ActivityItem[] = [
  { id: 'event-1', label: 'Demo workspace opened', detail: 'Local sample workspace ready', at: 'Today · 09:10' },
  { id: 'event-2', label: 'Campaign brief prepared', detail: 'A first conversation', at: 'Yesterday · 15:42' },
  { id: 'event-3', label: 'Draft added to planner', detail: 'A clearer view of your options', at: 'Apr 12 · 12:40' },
];

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(`adpilot-preview:${key}`);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function storeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(`adpilot-preview:${key}`, JSON.stringify(value));
  } catch {
    // The demo remains usable if browser storage is unavailable or full.
  }
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Recently'
    : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function AppButton({
  children,
  onClick,
  testId,
  kind = 'quiet',
  type = 'button',
  disabled = false,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  testId: string;
  kind?: 'primary' | 'quiet' | 'outline' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`apw-button apw-button-${kind}`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="apw-field">
      <span className="apw-field-label">{label}</span>
      {children}
      {hint && <span className="apw-field-hint">{hint}</span>}
    </label>
  );
}

function Artwork({ direction, format, variation = 1 }: { direction: string; format: string; variation?: number }) {
  return (
    <div className={`apw-art apw-art-${format} apw-art-variation-${variation % 3}`}>
      <div className="apw-art-window">
        <div className="apw-art-sun" />
        <div className="apw-art-hill apw-art-hill-back" />
        <div className="apw-art-hill apw-art-hill-front" />
        <div className="apw-art-orbit" />
      </div>
      <div className="apw-art-copy">
        <span className="apw-art-brand">NORTHLINE / ADVISORY</span>
        <span className="apw-art-title">{direction === 'Bold typographic poster' ? 'A clearer next step.' : 'Make room for what matters.'}</span>
        <span className="apw-art-foot">A thoughtful plan begins here</span>
      </div>
      <span className="apw-art-stamp">LOCAL<br />CONCEPT</span>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="apw-heading">
      <div>
        <div className="apw-eyebrow"><span />{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="apw-heading-actions">{actions}</div>}
    </div>
  );
}

function LocalOnlyNote({ children = 'Local demo only · nothing is sent to a platform.' }: { children?: string }) {
  return <div className="apw-local-note"><ShieldCheck size={14} /><span>{children}</span></div>;
}

export default function PreviewWorkspace({
  embedded = false,
  initialSection = 'overview',
  onSectionChange,
  onAiCreativeApproved,
}: {
  embedded?: boolean;
  initialSection?: PreviewSection;
  onSectionChange?: (section: PreviewSection) => void;
  onAiCreativeApproved?: (creative: ApprovedAiCreative) => void;
} = {}) {
  const [section, setSection] = useState<Section>(initialSection);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>(() => readLocal('drafts', starterDrafts));
  const [briefs, setBriefs] = useState<Brief[]>(() => readLocal('briefs', starterBriefs));
  const [activity, setActivity] = useState<ActivityItem[]>(() => readLocal('activity', initialActivity));
  const [settings, setSettings] = useState<BrandSettings>(() => ({
    ...initialSettings,
    ...readLocal('settings', initialSettings),
  }));
  const [paidPlan, setPaidPlan] = useState<PaidPlan>(() => {
    const defaults: PaidPlan = {
      name: 'A first conversation',
      creativeId: starterDrafts[0].id,
      objective: 'Website traffic',
      audience: 'Adults in our local area considering financial advice',
      dailyBudget: '18',
      countries: 'ZA',
      startDate: localDateTime(3).slice(0, 10),
      endDate: localDateTime(17).slice(0, 10),
      destination: 'https://northline.example/advice',
      specialCategory: 'FINANCIAL_PRODUCTS_SERVICES',
      categoryConfirmed: false,
    };
    return { ...defaults, ...readLocal('paid-plan', defaults) };
  });
  const [activeFilter, setActiveFilter] = useState<'all' | DraftStatus>('all');
  const [draftComposer, setDraftComposer] = useState(() => ({
    direction: settings.creativeDirection === 'rotate' ? directions[0] : settings.creativeDirection,
    format: settings.imageFormat,
    variations: '2',
    quality: settings.imageQuality,
    style: settings.visualStyle,
    source: 'brand-library',
    scene: settings.sceneNotes,
  }));
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<string | null>(null);
  const [scheduleValue, setScheduleValue] = useState(() => localDateTime(3));
  const [briefFormOpen, setBriefFormOpen] = useState(false);
  const [briefForm, setBriefForm] = useState({ title: '', audience: '', offer: '' });
  const [photoConsent, setPhotoConsent] = useState(false);
  const [sessionPhoto, setSessionPhoto] = useState<{ name: string; url: string } | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [paidSaved, setPaidSaved] = useState(false);
  const [toast, setToast] = useState('');
  const [draftSearch, setDraftSearch] = useState('');

  useEffect(() => storeLocal('drafts', drafts), [drafts]);
  useEffect(() => storeLocal('briefs', briefs), [briefs]);
  useEffect(() => storeLocal('activity', activity.slice(0, 40)), [activity]);
  useEffect(() => storeLocal('settings', settings), [settings]);
  useEffect(() => storeLocal('paid-plan', paidPlan), [paidPlan]);
  useEffect(() => setSection(initialSection), [initialSection]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => () => {
    if (sessionPhoto?.url) URL.revokeObjectURL(sessionPhoto.url);
  }, [sessionPhoto]);

  const visibleDrafts = useMemo(() => {
    const query = draftSearch.trim().toLowerCase();
    return drafts.filter((draft) => {
      const matchesFilter = activeFilter === 'all' || draft.status === activeFilter;
      const matchesSearch = !query || `${draft.title} ${draft.caption} ${draft.direction}`.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [drafts, activeFilter, draftSearch]);
  const nonArchivedDrafts = drafts.filter((draft) => draft.status !== 'archived');
  const scheduledCount = drafts.filter((draft) => draft.status === 'scheduled').length;
  const draftCount = drafts.filter((draft) => draft.status === 'draft').length;
  const plannerWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return {
        date,
        key: localDateKey(date),
        isToday: localDateKey(date) === localDateKey(today),
      };
    });
  }, []);

  function logActivity(label: string, detail: string) {
    setActivity((items) => [{ id: makeId('event'), label, detail, at: 'Just now' }, ...items].slice(0, 40));
  }
  function notify(message: string) {
    setToast(message);
  }
  function navigate(next: Section) {
    setSection(next);
    setMobileMenuOpen(false);
    onSectionChange?.(next);
  }
  function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsGenerating(true);
    window.setTimeout(() => {
      const count = Number(draftComposer.variations);
      const titles = [
        'A plan that starts with your priorities',
        'Make room for the next chapter',
        'A clearer way to look ahead',
        'Thoughtful advice, shaped around you',
      ];
      const created = Array.from({ length: count }, (_, index): Draft => ({
        id: makeId('draft'),
        title: titles[(drafts.length + index) % titles.length],
        caption: [
          'Your plans should reflect the life you want to build. Start with a calm, considered conversation about what matters to you.',
          'There is no single route through a life change. We can help you understand the options and decide what feels right for you.',
          'A little clarity can make the next decision feel easier. Let’s start with the questions that matter most to you.',
          'Independent advice, in plain language, and at your pace. Begin with a conversation about the future you have in mind.',
        ][(drafts.length + index) % 4],
        direction: draftComposer.direction,
        format: draftComposer.format,
        status: 'draft',
        createdAt: new Date().toISOString(),
        variation: index + 1,
        creativeOptions: {
          quality: draftComposer.quality,
          style: draftComposer.style,
          source: draftComposer.source,
          scene: draftComposer.scene,
        },
      }));
      setDrafts((items) => [...created, ...items]);
      logActivity('Local draft created', `${created.length} ${created.length === 1 ? 'variation' : 'variations'} · ${draftComposer.direction}`);
      setIsGenerating(false);
      notify(`${created.length} sample ${created.length === 1 ? 'draft' : 'drafts'} added locally.`);
      setSection('studio');
    }, 420);
  }
  function updateDraft(id: string, changes: Partial<Draft>) {
    setDrafts((items) => items.map((draft) => draft.id === id ? { ...draft, ...changes } : draft));
  }
  function createDraftFromBrief(brief: Brief) {
    const draft: Draft = {
      id: makeId('draft'),
      title: brief.title,
      caption: `${brief.offer} Start with a conversation about what matters to you. ${settings.disclosure}`.trim(),
      direction: settings.creativeDirection === 'rotate' ? directions[0] : settings.creativeDirection,
      format: settings.imageFormat,
      status: 'draft',
      createdAt: new Date().toISOString(),
      variation: 1,
    };
    setDrafts((items) => [draft, ...items]);
    logActivity('Local draft created from brief', brief.title);
    setSection('studio');
    notify('A sample draft from this brief was added locally.');
  }
  function duplicateDraft(draft: Draft) {
    const copy = { ...draft, id: makeId('draft'), title: `${draft.title} — copy`, status: 'draft' as const, scheduledAt: undefined, createdAt: new Date().toISOString() };
    setDrafts((items) => [copy, ...items]);
    logActivity('Draft duplicated', copy.title);
    notify('A local copy was created as a draft.');
  }
  function archiveDraft(draft: Draft) {
    updateDraft(draft.id, { status: 'archived', scheduledAt: undefined });
    logActivity('Draft archived', draft.title);
    notify('Draft moved to the local archive.');
  }
  function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scheduleDraft) return;
    const item = drafts.find((draft) => draft.id === scheduleDraft);
    updateDraft(scheduleDraft, { status: 'scheduled', scheduledAt: scheduleValue });
    logActivity('Local schedule added', item?.title ?? 'Campaign draft');
    setScheduleDraft(null);
    notify('Schedule saved in this browser only. Nothing will publish.');
  }
  function saveEditedDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDraft) return;
    updateDraft(editingDraft.id, { title: editingDraft.title, caption: editingDraft.caption });
    logActivity('Draft edited', editingDraft.title);
    setEditingDraft(null);
    notify('Draft changes saved locally.');
  }
  function addBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const brief: Brief = { ...briefForm, id: makeId('brief'), status: 'Planning', autopilot: false };
    setBriefs((items) => [brief, ...items]);
    logActivity('Campaign brief created', brief.title);
    setBriefForm({ title: '', audience: '', offer: '' });
    setBriefFormOpen(false);
    notify('Campaign brief saved locally.');
  }
  function toggleAutopilot(brief: Brief) {
    setBriefs((items) => items.map((item) => item.id === brief.id ? { ...item, autopilot: !item.autopilot } : item));
    logActivity(brief.autopilot ? 'Local autopilot paused' : 'Local autopilot preview enabled', brief.title);
    notify(brief.autopilot ? 'Local autopilot preview paused.' : 'Preview flag changed only; no posts will be created or published.');
  }
  function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      notify('Choose a JPG or PNG for this in-session preview.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('This preview accepts images up to 5 MB.');
      event.target.value = '';
      return;
    }
    if (sessionPhoto?.url) URL.revokeObjectURL(sessionPhoto.url);
    setSessionPhoto({ name: file.name, url: URL.createObjectURL(file) });
    logActivity('Session photo preview opened', file.name);
    notify('Photo is available for this session only; it is not saved.');
    event.target.value = '';
  }
  function saveBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsSaved(true);
    setDraftComposer((current) => ({
      ...current,
      direction: settings.creativeDirection === 'rotate' ? directions[0] : settings.creativeDirection,
      format: settings.imageFormat,
      quality: settings.imageQuality,
      style: settings.visualStyle,
      scene: settings.sceneNotes,
    }));
    logActivity('Brand defaults saved', settings.business);
    notify('Brand defaults saved in this browser.');
    window.setTimeout(() => setSettingsSaved(false), 2400);
  }
  function savePaidPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaidSaved(true);
    logActivity('Paid campaign plan saved', paidPlan.name);
    notify('Plan saved locally and remains unsubmitted.');
    window.setTimeout(() => setPaidSaved(false), 2400);
  }

  const title = sections.find((item) => item.id === section)?.label ?? 'Overview';
  const headingActions = section === 'overview'
    ? <AppButton kind="primary" testId="button-overview-new-draft" onClick={() => navigate('studio')}><Plus size={16} /> Start a creative draft</AppButton>
    : section === 'planner'
      ? <AppButton kind="outline" testId="button-planner-create" onClick={() => navigate('studio')}><Plus size={15} /> Add a draft</AppButton>
      : undefined;
  return (
    <div className={`apw-root ${embedded ? 'apw-root-embedded' : ''}`} style={{ '--apw-brand': settings.brandColor } as CSSProperties}>
      <style>{styles}</style>
      {embedded && <style>{`.apw-root-embedded{display:block;min-height:0;background:transparent;overflow:visible}.apw-root-embedded .apw-main{margin-left:0}.apw-root-embedded .apw-content{width:100%;min-height:0;margin:0;padding:0}`}</style>}
      {!embedded && (
        <aside className={`apw-sidebar ${mobileMenuOpen ? 'apw-sidebar-open' : ''}`} aria-label="Workspace navigation">
          <div className="apw-brand-lockup">
            <span className="apw-brand-mark"><Radio size={18} strokeWidth={2.2} /></span>
            <span className="apw-wordmark">adpilot<span>.</span></span>
            <button className="apw-mobile-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation" data-testid="button-close-workspace-navigation"><X size={18} /></button>
          </div>
          <div className="apw-demo-pill"><span />LOCAL DEMO</div>
          <nav className="apw-nav">
            {(['Workspace', 'Campaigns', 'Business'] as const).map((group) => (
              <div className="apw-nav-group" key={group}>
                <div className="apw-nav-heading">{group}</div>
                {sections.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => navigate(id)}
                    className={`apw-nav-item ${section === id ? 'apw-nav-selected' : ''}`}
                    aria-current={section === id ? 'page' : undefined}
                    data-testid={`nav-${id}`}
                  >
                    <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
                    {id === 'planner' && scheduledCount > 0 && <span className="apw-nav-count">{scheduledCount}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="apw-sidebar-bottom">
            <div className="apw-sidebar-note">
              <div className="apw-note-icon"><CircleHelp size={15} /></div>
              <p>Your work stays here until you decide what to do next.</p>
              <span>NO CONNECTIONS · NO PUBLISHING</span>
            </div>
            <Link href="/" className="nav-item" data-testid="link-exit-preview"><ArrowDownRight size={16} /><span>Return to the sign-in page</span></Link>
            <div className="apw-user-chip">
              <div className="apw-avatar">ME</div>
              <div><strong>{settings.adviser}</strong><span>Workspace owner · preview</span></div>
              <MoreHorizontal size={17} aria-hidden="true" />
            </div>
          </div>
        </aside>
      )}
      {!embedded && mobileMenuOpen && <button className="apw-mobile-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation overlay" data-testid="button-navigation-scrim" />}

      <main className={`apw-main ${embedded ? 'apw-main-embedded' : ''}`}>
        {!embedded && <header className="apw-topbar">
          <button className="apw-menu-toggle" onClick={() => setMobileMenuOpen(true)} aria-label="Open workspace navigation" data-testid="button-open-workspace-navigation"><Menu size={19} /></button>
          <div className="apw-breadcrumb"><span>ADPILOT</span><ChevronRight size={13} /><strong>{title}</strong></div>
          <div className="apw-topbar-right">
            <span className="apw-preview-state"><span />Preview mode</span>
            <button className="apw-help-button" onClick={() => notify('This workspace is a local-only product preview.')} aria-label="About the local preview" data-testid="button-preview-help"><CircleHelp size={17} /></button>
          </div>
        </header>}
        <div className={`apw-content ${embedded ? 'apw-content-embedded' : ''}`}>
          <div className="apw-demo-banner" role="note" data-testid="status-local-demo">
            <span className="apw-banner-symbol"><ShieldCheck size={15} /></span>
            <p><strong>Local-only preview</strong><span>Sample workspace data lives in this browser. External connections, money movement and publishing are unavailable.</span></p>
            <span className="apw-banner-right">NO LIVE ACTIONS</span>
          </div>

          {section === 'overview' && (
            <section className="apw-page apw-page-enter" data-testid="page-overview">
              <SectionHeading eyebrow="Your business, in motion" title="A clear view of what’s next." description="A grounded place to shape campaigns, review the plan and stay in control." actions={headingActions} />
              <div className="apw-overview-grid">
                <div className="apw-overview-main">
                  <div className="apw-stat-grid">
                    <div className="apw-stat-card apw-stat-green"><div><span>Working drafts</span><FileText size={17} /></div><strong>{draftCount}</strong><small>Ideas still taking shape</small></div>
                    <div className="apw-stat-card apw-stat-ochre"><div><span>Planned locally</span><CalendarDays size={17} /></div><strong>{scheduledCount}</strong><small>Nothing is queued to publish</small></div>
                    <div className="apw-stat-card apw-stat-rose"><div><span>Campaign briefs</span><MessageSquareText size={17} /></div><strong>{briefs.length}</strong><small>Direction before creative</small></div>
                  </div>
                  <section className="apw-panel apw-recent-panel">
                    <div className="apw-panel-head">
                      <div><div className="apw-overline">THE WORKING TABLE</div><h2>Recent creative</h2></div>
                      <button className="apw-text-action" onClick={() => navigate('planner')} data-testid="button-overview-all-drafts">View planner <ArrowRight size={14} /></button>
                    </div>
                    {nonArchivedDrafts.slice(0, 3).map((draft, index) => (
                      <DraftRow
                        key={draft.id}
                        draft={draft}
                        index={index}
                        onEdit={() => setEditingDraft(draft)}
                        onDuplicate={() => duplicateDraft(draft)}
                        onArchive={() => archiveDraft(draft)}
                        onSchedule={() => { setScheduleDraft(draft.id); setScheduleValue(draft.scheduledAt ?? localDateTime(3)); }}
                      />
                    ))}
                    {nonArchivedDrafts.length === 0 && <EmptyMessage title="A fresh page" body="Your next draft will appear here." action="Make a draft" onAction={() => navigate('studio')} />}
                  </section>
                </div>
                <aside className="apw-overview-side">
                  <div className="apw-next-card">
                    <div className="apw-next-card-top"><span>THE NEXT SMALL STEP</span><Sparkles size={16} /></div>
                    <h2>Begin with a useful thought.</h2>
                    <p>Pick a direction, make a few variations, and keep the one that sounds like you.</p>
                    <button onClick={() => navigate('studio')} data-testid="button-next-step-studio">Open creative studio <ArrowRight size={15} /></button>
                    <div className="apw-loop loop-one" /><div className="apw-loop loop-two" />
                  </div>
                  <div className="apw-connection-card">
                    <div className="apw-overline">CHANNELS</div>
                    <div className="apw-connection-inline"><span className="apw-connection-dot" /><strong>Not connected</strong><span>Preview</span></div>
                    <p>Connect actions are intentionally unavailable here.</p>
                    <button onClick={() => navigate('connections')} data-testid="button-overview-channels">Review channel status <ArrowRight size={14} /></button>
                  </div>
                  <div className="apw-quiet-quote"><span>“</span><p>Clear is kind. Keep the work honest, useful and yours.</p><small>ADPILOT WORKING PRINCIPLE</small></div>
                </aside>
              </div>
              <div className="apw-bottom-ribbon">
                <span className="apw-ribbon-mark"><Check size={14} /></span>
                <span><strong>Control stays with you.</strong> Drafting is local. Publishing requires a live setup, which this preview does not provide.</span>
                <button onClick={() => navigate('activity')} data-testid="button-overview-history">See activity <ArrowRight size={14} /></button>
              </div>
            </section>
          )}

          {section === 'studio' && (
            <section className="apw-page apw-page-enter" data-testid="page-creative-studio">
              <SectionHeading
                eyebrow={embedded ? 'Draft, review, then decide' : 'A place to try the shape of an idea'}
                title="Creative studio"
                description={embedded
                  ? 'Use Gemini for editable copy and Cloudflare Workers AI for a photo. Review every result before adding it to this business’s planner.'
                  : 'Create sample campaign drafts using local placeholder artwork. Nothing is generated by an external service.'}
              />
              {embedded && onAiCreativeApproved ? (
                <AiCreativeWorkflow onApproved={onAiCreativeApproved} />
              ) : (
                <>
              <div className="apw-studio-layout">
                <form className="apw-panel apw-studio-form" onSubmit={createDraft} data-testid="form-creative-studio">
                  <div className="apw-panel-head apw-panel-head-lined">
                    <div><div className="apw-overline">01 / CREATIVE INPUT</div><h2>Set the direction</h2></div>
                    <span className="apw-setup-step">LOCAL DRAFT</span>
                  </div>
                  <div className="apw-form-grid">
                    <Field label="Creative direction">
                      <select className="apw-input" value={draftComposer.direction} onChange={(event) => setDraftComposer((value) => ({ ...value, direction: event.target.value }))} data-testid="select-creative-direction" aria-label="Creative direction">
                        {directions.map((direction) => <option key={direction}>{direction}</option>)}
                      </select>
                    </Field>
                    <Field label="Image format">
                      <select className="apw-input" value={draftComposer.format} onChange={(event) => setDraftComposer((value) => ({ ...value, format: event.target.value }))} data-testid="select-image-format" aria-label="Image format">
                        <option value="square">Square · 1:1</option><option value="portrait">Portrait · 4:5</option><option value="landscape">Landscape · 1.91:1</option>
                      </select>
                    </Field>
                    <Field label="Variations">
                      <select className="apw-input" value={draftComposer.variations} onChange={(event) => setDraftComposer((value) => ({ ...value, variations: event.target.value }))} data-testid="select-variation-count" aria-label="Number of creative variations">
                        {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'variation' : 'variations'}</option>)}
                      </select>
                    </Field>
                    <Field label="Image quality">
                      <select className="apw-input" value={draftComposer.quality} onChange={(event) => setDraftComposer((value) => ({ ...value, quality: event.target.value }))} data-testid="select-image-quality" aria-label="Image quality">
                        <option value="low">Draft</option><option value="medium">Balanced</option><option value="high">High detail</option>
                      </select>
                    </Field>
                    <Field label="Photographic style">
                      <select className="apw-input" value={draftComposer.style} onChange={(event) => setDraftComposer((value) => ({ ...value, style: event.target.value }))} data-testid="select-photo-style" aria-label="Photographic style">
                        <option value="natural">Natural editorial</option><option value="cinematic">Cinematic</option><option value="bright">Bright and welcoming</option><option value="minimal">Minimal</option>
                      </select>
                    </Field>
                    <Field label="Source photo">
                      <select className="apw-input" value={draftComposer.source} onChange={(event) => setDraftComposer((value) => ({ ...value, source: event.target.value }))} data-testid="select-source-photo" aria-label="Source photo">
                        <option value="brand-library">Brand library · sample artwork</option>
                        {sessionPhoto && <option value="session-photo">Session photo · {sessionPhoto.name}</option>}
                        <option value="none">No photo · typography-led</option>
                      </select>
                    </Field>
                    <Field label="Scene instructions" hint="Optional notes for a future creative workflow. Up to 500 characters.">
                      <textarea className="apw-input apw-textarea" maxLength={500} placeholder="For example: calm morning light, a lived-in home, no staged office scene." value={draftComposer.scene} onChange={(event) => setDraftComposer((value) => ({ ...value, scene: event.target.value }))} data-testid="textarea-scene-instructions" aria-label="Scene instructions" />
                    </Field>
                  </div>
                  <div className="apw-form-foot">
                    <span><ShieldCheck size={14} />Sample copy + CSS artwork only</span>
                    <AppButton kind="primary" type="submit" testId="button-create-local-draft" disabled={isGenerating}>{isGenerating ? <><span className="apw-button-pulse" />Preparing sample…</> : <><Sparkles size={15} /> Create local draft</>}</AppButton>
                  </div>
                </form>
                <aside className="apw-studio-aside">
                  <div className="apw-preview-card">
                    <div className="apw-preview-head"><div><span className="apw-overline">CONCEPT PREVIEW</span><h3>Direction, not a final asset</h3></div><span className="apw-preview-tag">LOCAL</span></div>
                    <Artwork direction={draftComposer.direction} format={draftComposer.format} />
                    <p>This is a CSS-made placeholder to help you imagine the composition. No image model runs in this demo.</p>
                  </div>
                  <LocalOnlyNote>Drafts and settings stay in local browser storage.</LocalOnlyNote>
                </aside>
              </div>
              <section className="apw-panel apw-studio-library">
                <div className="apw-panel-head">
                  <div><div className="apw-overline">YOUR LOCAL WORK</div><h2>Recent drafts</h2></div>
                  <button className="apw-text-action" onClick={() => navigate('planner')} data-testid="button-studio-open-planner">Open planner <ArrowRight size={14} /></button>
                </div>
                <div className="apw-draft-grid">
                  {drafts.filter((draft) => draft.status !== 'archived').slice(0, 4).map((draft, index) => (
                    <DraftCard key={draft.id} draft={draft} index={index} onEdit={() => setEditingDraft(draft)} onDuplicate={() => duplicateDraft(draft)} onArchive={() => archiveDraft(draft)} onSchedule={() => { setScheduleDraft(draft.id); setScheduleValue(draft.scheduledAt ?? localDateTime(3)); }} />
                  ))}
                  {drafts.filter((draft) => draft.status !== 'archived').length === 0 && <EmptyMessage title="Your first concept starts here" body="Choose a direction above to create a local sample draft." action="Create a draft" onAction={() => document.getElementById('select-creative-direction')?.focus()} />}
                </div>
              </section>
                </>
              )}
            </section>
          )}

          {section === 'photos' && (
            <section className="apw-page apw-page-enter" data-testid="page-brand-photographs">
              <SectionHeading eyebrow="Your image library" title="Brand photographs" description="Preview an image for this session, or browse the sample brand library. Uploads are never stored by this demo." />
              <div className="apw-photo-layout">
                <section className="apw-panel apw-photo-upload">
                  <div className="apw-photo-upload-icon"><ImagePlus size={22} /></div>
                  <div className="apw-overline">SESSION PREVIEW</div>
                  <h2>Bring a photograph into view.</h2>
                  <p>JPG or PNG up to 5 MB. The file stays in memory for this browser session; it will not be saved to localStorage or sent anywhere.</p>
                  <label className="apw-consent-check">
                    <input type="checkbox" checked={photoConsent} onChange={(event) => setPhotoConsent(event.target.checked)} data-testid="checkbox-photo-consent" aria-label="I have permission to preview this photo" />
                    <span>I have the right to use and preview this image, and I have appropriate consent from anyone identifiable in it.</span>
                  </label>
                  <label className={`apw-upload-control ${!photoConsent ? 'apw-upload-disabled' : ''}`} aria-disabled={!photoConsent}>
                    <Upload size={16} /> Choose an image
                    <input type="file" accept="image/jpeg,image/png" onChange={uploadPhoto} disabled={!photoConsent} aria-label="Choose a photo for this session preview" data-testid="input-photo-upload" />
                  </label>
                  <span className="apw-small-disclaimer">Upload disabled until consent is confirmed.</span>
                </section>
                <section className="apw-panel apw-photo-preview">
                  <div className="apw-panel-head"><div><div className="apw-overline">IN-SESSION PHOTO</div><h2>{sessionPhoto ? sessionPhoto.name : 'Nothing selected yet'}</h2></div><span className="apw-preview-tag">NOT SAVED</span></div>
                  {sessionPhoto ? (
                    <div className="apw-session-image-wrap"><img src={sessionPhoto.url} alt={`In-session preview of ${sessionPhoto.name}`} data-testid="img-session-photo-preview" /><button onClick={() => { URL.revokeObjectURL(sessionPhoto.url); setSessionPhoto(null); notify('Session photo preview removed.'); }} aria-label="Remove session photo preview" data-testid="button-remove-session-photo"><X size={16} /></button></div>
                  ) : <div className="apw-photo-empty"><ImagePlus size={25} /><span>Select an image after confirming consent.</span></div>}
                  <p className="apw-photo-private"><ShieldCheck size={14} />Image data is not persisted or transmitted.</p>
                </section>
              </div>
              <section className="apw-panel apw-brand-library">
                <div className="apw-panel-head"><div><div className="apw-overline">SAMPLE BRAND LIBRARY</div><h2>Composition studies</h2></div><span className="apw-preview-tag">CSS CONCEPTS</span></div>
                <div className="apw-photo-grid">
                  {['Editorial / early light', 'Quiet landscape / forward', 'Still life / considered'].map((name, index) => <div className="apw-photo-tile" key={name}><Artwork direction={directions[index === 1 ? 10 : index === 2 ? 2 : 0]} format="square" variation={index + 1} /><div><span>0{index + 1}</span><strong>{name}</strong></div></div>)}
                </div>
              </section>
            </section>
          )}

          {section === 'planner' && (
            <section className="apw-page apw-page-enter" data-testid="page-publishing-planner">
              <SectionHeading eyebrow="A considered rhythm" title="Publishing planner" description="Arrange drafts in a local calendar. A planned date here is a reminder, not a publishing queue." actions={headingActions} />
              <div className="apw-planner-layout">
                <section className="apw-panel apw-planner-calendar">
                  <div className="apw-panel-head"><div><div className="apw-overline">APRIL 2026 · DEMO VIEW</div><h2>One week at a glance</h2></div><span className="apw-preview-tag">LOCAL PLAN</span></div>
                  <div className="apw-week-grid">
                    {plannerWeek.map(({ date, key, isToday }) => {
                      const scheduled = drafts.filter((draft) => draft.status === 'scheduled' && draft.scheduledAt?.slice(0, 10) === key);
                      return <div key={key} className={`apw-day ${isToday ? 'apw-day-today' : ''}`}><span>{date.toLocaleDateString('en', { weekday: 'short' }).toUpperCase()}</span><strong>{date.getDate()}</strong>{scheduled.map((item) => <div className="apw-calendar-event" key={item.id} title={item.title}><span />{item.title}</div>)}{scheduled.length === 0 && isToday && <div className="apw-day-placeholder">Open</div>}</div>;
                    })}
                  </div>
                  <div className="apw-planner-foot"><span><i className="apw-dot-scheduled" />Local reminder</span><span><Clock3 size={13} />Times use {settings.timezone}</span></div>
                </section>
                <aside className="apw-planner-aside">
                  <div className="apw-planner-callout"><CalendarDays size={18} /><div><strong>Publishing stays off.</strong><p>Dates are saved in your browser only. No channel is connected to this planner.</p></div></div>
                  <AppButton kind="primary" testId="button-planner-add-draft" onClick={() => navigate('studio')}><Plus size={15} /> Make a draft</AppButton>
                </aside>
              </div>
              <section className="apw-panel apw-draft-list-panel">
                <div className="apw-panel-head apw-planner-list-heading">
                  <div><div className="apw-overline">CAMPAIGN LIBRARY</div><h2>Drafts and reminders</h2></div>
                  <div className="apw-list-tools">
                    <input className="apw-search" type="search" aria-label="Search drafts" placeholder="Search drafts" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} data-testid="input-draft-search" />
                    <select className="apw-filter" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as typeof activeFilter)} aria-label="Filter drafts by status" data-testid="select-draft-filter">
                      <option value="all">All work</option><option value="draft">Drafts</option><option value="scheduled">Planned</option><option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
                {visibleDrafts.length ? <div className="apw-table">
                  <div className="apw-table-head"><span>CAMPAIGN</span><span>FORMAT</span><span>STATUS</span><span>DATE</span><span>ACTIONS</span></div>
                  {visibleDrafts.map((draft, index) => <DraftRow key={draft.id} draft={draft} index={index} onEdit={() => setEditingDraft(draft)} onDuplicate={() => duplicateDraft(draft)} onArchive={() => archiveDraft(draft)} onSchedule={() => { setScheduleDraft(draft.id); setScheduleValue(draft.scheduledAt ?? localDateTime(3)); }} />)}
                </div> : <EmptyMessage title="No work in this view" body="Try another filter or create a new local draft." action="Create a draft" onAction={() => navigate('studio')} />}
              </section>
            </section>
          )}

          {section === 'briefs' && (
            <section className="apw-page apw-page-enter" data-testid="page-campaign-briefs">
              <SectionHeading eyebrow="Think before you write" title="Campaign briefs" description="Keep audience, offer and intent together. Briefs are private demo records stored in this browser." actions={<AppButton kind="primary" testId="button-new-brief" onClick={() => setBriefFormOpen((open) => !open)}><Plus size={16} /> New brief</AppButton>} />
              {briefFormOpen && <form className="apw-panel apw-brief-form" onSubmit={addBrief} data-testid="form-campaign-brief">
                <div className="apw-panel-head"><div><div className="apw-overline">NEW LOCAL BRIEF</div><h2>Start with the why.</h2></div><button className="apw-icon-button" type="button" onClick={() => setBriefFormOpen(false)} aria-label="Close campaign brief form" data-testid="button-close-brief-form"><X size={17} /></button></div>
                <div className="apw-form-grid apw-brief-fields">
                  <Field label="Brief name"><input required className="apw-input" value={briefForm.title} onChange={(event) => setBriefForm((form) => ({ ...form, title: event.target.value }))} placeholder="For example, A first conversation" data-testid="input-brief-title" /></Field>
                  <Field label="Who is it for?"><input required className="apw-input" value={briefForm.audience} onChange={(event) => setBriefForm((form) => ({ ...form, audience: event.target.value }))} placeholder="A clear, respectful audience" data-testid="input-brief-audience" /></Field>
                  <Field label="What is the offer?"><input required className="apw-input" value={briefForm.offer} onChange={(event) => setBriefForm((form) => ({ ...form, offer: event.target.value }))} placeholder="Use only a verified offer" data-testid="input-brief-offer" /></Field>
                </div>
                <div className="apw-form-foot"><span>Stored only in local browser storage</span><AppButton kind="primary" type="submit" testId="button-save-brief"><Save size={15} /> Save brief</AppButton></div>
              </form>}
              <div className="apw-brief-layout">
                <div className="apw-brief-list">
                  {briefs.map((brief, index) => <article className="apw-panel apw-brief-card" key={brief.id} data-testid={`card-brief-${brief.id}`}>
                    <div className="apw-brief-card-top"><span className="apw-brief-index">BRIEF / {String(index + 1).padStart(2, '0')}</span><span className={`apw-brief-status ${brief.status === 'Ready' ? 'is-ready' : ''}`}>{brief.status}</span></div>
                    <h2>{brief.title}</h2>
                    <div className="apw-brief-detail"><span>Audience</span><p>{brief.audience}</p></div>
                    <div className="apw-brief-detail"><span>Offer</span><p>{brief.offer}</p></div>
                      <div className="apw-brief-card-foot">
                      <div className="apw-autopilot-state"><span className={brief.autopilot ? 'is-on' : ''} />Local autopilot preview <small>{brief.autopilot ? 'ON' : 'OFF'}</small></div>
                      <button className="apw-toggle" role="switch" aria-checked={brief.autopilot} aria-label={`${brief.autopilot ? 'Pause' : 'Enable'} local autopilot preview for ${brief.title}`} onClick={() => toggleAutopilot(brief)} data-testid={`toggle-autopilot-${brief.id}`}><span /></button>
                    </div>
                      <div className="apw-brief-card-actions"><AppButton kind="outline" testId={`button-draft-from-brief-${brief.id}`} onClick={() => createDraftFromBrief(brief)}><Sparkles size={14} /> Make a sample draft</AppButton></div>
                  </article>)}
                  {briefs.length === 0 && <EmptyMessage title="No briefs yet" body="Capture the purpose of a campaign before you make creative." action="Create a brief" onAction={() => setBriefFormOpen(true)} />}
                </div>
                <aside className="apw-brief-aside">
                  <div className="apw-autopilot-explainer"><div className="apw-explainer-icon"><Radio size={17} /></div><span className="apw-overline">ABOUT AUTOPILOT</span><h3>Only a local state preview.</h3><p>The switch above is a product interaction preview. It does not schedule, generate, submit or publish anything.</p><div className="apw-explainer-rule" /><span>REAL AUTOMATION IS UNAVAILABLE</span></div>
                  <LocalOnlyNote>Use a brief as a north star, not a publishing instruction.</LocalOnlyNote>
                </aside>
              </div>
            </section>
          )}

          {section === 'paid' && (
            <section className="apw-page apw-page-enter" data-testid="page-paid-campaign-planning">
              <SectionHeading eyebrow="Paid social · planning only" title="A campaign plan, not an ad." description="Sketch the shape of a Facebook campaign for review. This form cannot create or activate ads." />
              <div className="apw-paid-layout">
                <form className="apw-panel apw-paid-form" onSubmit={savePaidPlan} data-testid="form-paid-campaign-plan">
                  <div className="apw-panel-head apw-panel-head-lined"><div><div className="apw-overline">PLANNING NOTES</div><h2>Set down the parameters.</h2></div><span className="apw-paid-status"><span />NOT SUBMITTED</span></div>
                  <Field label="Plan name"><input className="apw-input" required value={paidPlan.name} onChange={(event) => setPaidPlan((plan) => ({ ...plan, name: event.target.value }))} data-testid="input-paid-name" /></Field>
                  <div className="apw-form-grid">
                    <Field label="Completed concept"><select className="apw-input" value={paidPlan.creativeId} onChange={(event) => setPaidPlan((plan) => ({ ...plan, creativeId: event.target.value }))} data-testid="select-paid-creative">{nonArchivedDrafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.title}</option>)}</select></Field>
                    <Field label="Campaign objective"><input className="apw-input" value={paidPlan.objective} readOnly data-testid="input-paid-objective" /></Field>
                    <Field label="Daily budget · planning figure"><div className="apw-money-input"><span>R</span><input className="apw-input" type="number" min="0" step="1" value={paidPlan.dailyBudget} onChange={(event) => setPaidPlan((plan) => ({ ...plan, dailyBudget: event.target.value }))} data-testid="input-paid-budget" /></div></Field>
                    <Field label="Audience"><textarea className="apw-input apw-textarea" value={paidPlan.audience} onChange={(event) => setPaidPlan((plan) => ({ ...plan, audience: event.target.value }))} data-testid="textarea-paid-audience" /></Field>
                    <Field label="Country codes"><input className="apw-input" value={paidPlan.countries} onChange={(event) => setPaidPlan((plan) => ({ ...plan, countries: event.target.value.toUpperCase() }))} placeholder="ZA" data-testid="input-paid-countries" /></Field>
                    <Field label="Starts"><input className="apw-input" type="date" required value={paidPlan.startDate} onChange={(event) => setPaidPlan((plan) => ({ ...plan, startDate: event.target.value }))} data-testid="input-paid-start-date" /></Field>
                    <Field label="Ends"><input className="apw-input" type="date" required value={paidPlan.endDate} onChange={(event) => setPaidPlan((plan) => ({ ...plan, endDate: event.target.value }))} data-testid="input-paid-end-date" /></Field>
                    <Field label="Destination (planning note)"><input className="apw-input" value={paidPlan.destination} onChange={(event) => setPaidPlan((plan) => ({ ...plan, destination: event.target.value }))} data-testid="input-paid-destination" /></Field>
                    <Field label="Special ad category"><select className="apw-input" value={paidPlan.specialCategory} onChange={(event) => setPaidPlan((plan) => ({ ...plan, specialCategory: event.target.value }))} data-testid="select-paid-category"><option value="FINANCIAL_PRODUCTS_SERVICES">Financial products and services</option><option value="">None selected</option><option value="CREDIT">Credit</option><option value="HOUSING">Housing</option><option value="EMPLOYMENT">Employment</option></select></Field>
                  </div>
                  <label className="apw-consent-check"><input type="checkbox" required checked={paidPlan.categoryConfirmed} onChange={(event) => setPaidPlan((plan) => ({ ...plan, categoryConfirmed: event.target.checked }))} data-testid="checkbox-paid-category-confirmation" /><span>I have reviewed the campaign’s special ad category and targeting requirements.</span></label>
                  <div className="apw-financial-warning"><CreditCard size={16} /><p><strong>Budget is a planning note only.</strong><span>This preview cannot spend money, create an ad, or connect to Facebook.</span></p></div>
                  <div className="apw-form-foot"><span>Local browser record · not submitted</span><AppButton kind="primary" type="submit" testId="button-save-paid-plan"><Save size={15} /> {paidSaved ? 'Plan saved' : 'Save plan locally'}</AppButton></div>
                </form>
                <aside className="apw-panel apw-paid-summary">
                  <div className="apw-paid-summary-art"><span>PLANNING / 01</span><BarChart3 size={25} /><div className="apw-chart-lines"><i /><i /><i /><i /><i /></div></div>
                  <div className="apw-overline">PLAN SUMMARY</div><h2>{paidPlan.name || 'Untitled plan'}</h2>
                  <div className="apw-summary-row"><span>Creative concept</span><strong>{drafts.find((draft) => draft.id === paidPlan.creativeId)?.title ?? 'No concept selected'}</strong></div>
                  <div className="apw-summary-row"><span>Objective</span><strong>{paidPlan.objective}</strong></div>
                  <div className="apw-summary-row"><span>Planning budget</span><strong>R {paidPlan.dailyBudget || '0'} / day</strong></div>
                  <div className="apw-summary-row"><span>Countries</span><strong>{paidPlan.countries || 'None selected'}</strong></div>
                  <div className="apw-summary-row"><span>Dates</span><strong>{paidPlan.startDate} → {paidPlan.endDate}</strong></div>
                  <div className="apw-summary-row"><span>Special category</span><strong>{paidPlan.specialCategory || 'None selected'}</strong></div>
                  <button className="apw-unavailable" disabled title="Unavailable in this local demo" aria-label="Submit paid campaign plan unavailable in local demo" data-testid="button-paid-submit-unavailable"><span /><span>Submit or activate campaign</span><small>UNAVAILABLE IN PREVIEW</small></button>
                  <p className="apw-summary-note">The saved plan is a note for discussion, not an instruction to a platform.</p>
                </aside>
              </div>
            </section>
          )}

          {section === 'connections' && (
            <section className="apw-page apw-page-enter" data-testid="page-channel-connections">
              <SectionHeading eyebrow="Your channels, your choice" title="Channel connections" description="This preview shows where integrations would be managed. No credentials are requested or stored." />
              <div className="apw-connection-header"><div className="apw-connection-header-icon"><Radio size={20} /></div><div><strong>Nothing is connected.</strong><span>Connection state is sample UI only.</span></div><span className="apw-status-chip"><i />NOT CONNECTED</span></div>
              <div className="apw-channel-list">
                {[
                  { name: 'Facebook Page', type: 'Organic social channel', initial: 'f', tone: 'facebook', note: 'Page identity and permissions are not available in this preview.' },
                  { name: 'Instagram', type: 'Professional account', initial: '◎', tone: 'instagram', note: 'No account connection or publishing capability in this preview.' },
                  { name: 'LinkedIn', type: 'Organisation page', initial: 'in', tone: 'linkedin', note: 'No organisation permissions or publishing capability in this preview.' },
                ].map((channel) => <article className="apw-panel apw-channel-card" key={channel.name}>
                  <div className={`apw-channel-logo apw-channel-${channel.tone}`}>{channel.initial}</div>
                  <div className="apw-channel-copy"><h2>{channel.name}</h2><span>{channel.type}</span><p>{channel.note}</p></div>
                  <span className="apw-channel-disconnected"><i />Not connected</span>
                  <button className="apw-unavailable-small" disabled aria-label={`Connect ${channel.name} unavailable in local demo`} data-testid={`button-connect-${channel.tone}`} title="Connection unavailable in local demo">Connect <span>Preview only</span></button>
                </article>)}
              </div>
              <div className="apw-safety-strip"><ShieldCheck size={17} /><p><strong>No credential inputs by design.</strong> OAuth, tokens, account verification and platform publishing are not implemented in this local-only prototype.</p></div>
            </section>
          )}

          {section === 'brand' && (
            <section className="apw-page apw-page-enter" data-testid="page-brand-settings">
              <SectionHeading eyebrow="Defaults that keep things consistent" title="Brand & defaults" description="Set the working context for your local demo drafts. Changes are saved in this browser only." />
              <form className="apw-settings-layout" onSubmit={saveBrand} data-testid="form-brand-settings">
                <section className="apw-panel apw-settings-form">
                  <div className="apw-panel-head apw-panel-head-lined"><div><div className="apw-overline">BUSINESS IDENTITY</div><h2>Set a steady foundation.</h2></div><span className="apw-preview-tag">LOCAL SETTINGS</span></div>
                  <div className="apw-form-grid">
                    <Field label="Business name"><input required className="apw-input" value={settings.business} onChange={(event) => setSettings((value) => ({ ...value, business: event.target.value }))} data-testid="input-brand-business" /></Field>
                    <Field label="Adviser name"><input required className="apw-input" value={settings.adviser} onChange={(event) => setSettings((value) => ({ ...value, adviser: event.target.value }))} data-testid="input-brand-adviser" /></Field>
                    <Field label="Brand voice"><input className="apw-input" value={settings.voice} onChange={(event) => setSettings((value) => ({ ...value, voice: event.target.value }))} data-testid="input-brand-voice" /></Field>
                    <Field label="Audience"><textarea className="apw-input apw-textarea" value={settings.audience} onChange={(event) => setSettings((value) => ({ ...value, audience: event.target.value }))} data-testid="textarea-brand-audience" /></Field>
                    <Field label="Verified facts"><textarea className="apw-input apw-textarea" value={settings.facts} onChange={(event) => setSettings((value) => ({ ...value, facts: event.target.value }))} data-testid="textarea-brand-facts" /></Field>
                    <Field label="Offer"><input className="apw-input" value={settings.offer} onChange={(event) => setSettings((value) => ({ ...value, offer: event.target.value }))} data-testid="input-brand-offer" /></Field>
                    <Field label="Call to action"><input className="apw-input" value={settings.cta} onChange={(event) => setSettings((value) => ({ ...value, cta: event.target.value }))} data-testid="input-brand-cta" /></Field>
                    <Field label="Destination (reference only)"><input className="apw-input" type="url" value={settings.destination} onChange={(event) => setSettings((value) => ({ ...value, destination: event.target.value }))} data-testid="input-brand-destination" /></Field>
                    <Field label="Disclosure"><textarea className="apw-input apw-textarea" value={settings.disclosure} onChange={(event) => setSettings((value) => ({ ...value, disclosure: event.target.value }))} data-testid="textarea-brand-disclosure" /></Field>
                    <Field label="Facebook Page URL (reference only)"><input className="apw-input" type="url" value={settings.facebookUrl} onChange={(event) => setSettings((value) => ({ ...value, facebookUrl: event.target.value }))} data-testid="input-brand-facebook-url" /></Field>
                    <Field label="Instagram profile URL (reference only)"><input className="apw-input" type="url" value={settings.instagramUrl} onChange={(event) => setSettings((value) => ({ ...value, instagramUrl: event.target.value }))} data-testid="input-brand-instagram-url" /></Field>
                    <Field label="LinkedIn company URL (reference only)"><input className="apw-input" type="url" value={settings.linkedinUrl} onChange={(event) => setSettings((value) => ({ ...value, linkedinUrl: event.target.value }))} data-testid="input-brand-linkedin-url" /></Field>
                    <Field label="Brand colour"><div className="apw-color-field"><input type="color" value={settings.brandColor} onChange={(event) => setSettings((value) => ({ ...value, brandColor: event.target.value }))} aria-label="Choose brand colour" data-testid="input-brand-color" /><code>{settings.brandColor.toUpperCase()}</code></div></Field>
                    <Field label="Timezone"><select className="apw-input" value={settings.timezone} onChange={(event) => setSettings((value) => ({ ...value, timezone: event.target.value }))} data-testid="select-brand-timezone"><option>Africa/Johannesburg</option><option>Europe/London</option><option>America/New_York</option><option>Australia/Sydney</option></select></Field>
                    <Field label="Default posting time"><input className="apw-input" type="time" value={settings.postingTime} onChange={(event) => setSettings((value) => ({ ...value, postingTime: event.target.value }))} data-testid="input-brand-posting-time" /></Field>
                    <Field label="Default creative direction"><select className="apw-input" value={settings.creativeDirection} onChange={(event) => setSettings((value) => ({ ...value, creativeDirection: event.target.value }))} data-testid="select-brand-direction"><option value="rotate">Rotate directions</option>{directions.map((direction) => <option key={direction}>{direction}</option>)}</select></Field>
                    <Field label="Default image format"><select className="apw-input" value={settings.imageFormat} onChange={(event) => setSettings((value) => ({ ...value, imageFormat: event.target.value }))} data-testid="select-brand-image-format"><option value="square">Square · 1080 × 1080</option><option value="portrait">Portrait · 1080 × 1350</option><option value="landscape">Landscape · 1200 × 630</option></select></Field>
                    <Field label="Default image quality"><select className="apw-input" value={settings.imageQuality} onChange={(event) => setSettings((value) => ({ ...value, imageQuality: event.target.value }))} data-testid="select-brand-image-quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
                    <Field label="Default photographic style"><select className="apw-input" value={settings.visualStyle} onChange={(event) => setSettings((value) => ({ ...value, visualStyle: event.target.value }))} data-testid="select-brand-photo-style"><option value="natural">Natural editorial</option><option value="cinematic">Cinematic</option><option value="bright">Bright lifestyle</option><option value="minimal">Minimal composition</option></select></Field>
                    <Field label="Default scene instructions"><textarea className="apw-input apw-textarea" maxLength={500} value={settings.sceneNotes} onChange={(event) => setSettings((value) => ({ ...value, sceneNotes: event.target.value }))} data-testid="textarea-brand-scene-notes" /></Field>
                  </div>
                  <Field label="Preview destinations">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {(['facebook', 'instagram', 'linkedin'] as const).map((channel) => (
                        <label className="apw-consent-check" key={channel}>
                          <input type="checkbox" checked={settings.channels.includes(channel)} onChange={(event) => setSettings((value) => ({ ...value, channels: event.target.checked ? [...value.channels, channel] : value.channels.filter((item) => item !== channel) }))} data-testid={`checkbox-brand-channel-${channel}`} />
                          <span>{channel === 'linkedin' ? 'LinkedIn company Page' : channel[0].toUpperCase() + channel.slice(1)}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                  <div className="apw-form-foot"><span>Local defaults · no network requests</span><AppButton kind="primary" type="submit" testId="button-save-brand-settings"><Save size={15} /> {settingsSaved ? 'Saved' : 'Save defaults'}</AppButton></div>
                </section>
                <aside className="apw-settings-aside">
                  <div className="apw-brand-preview-card">
                    <div className="apw-brand-preview-top"><span className="apw-brand-preview-mark" style={{ background: settings.brandColor }}>{settings.business.slice(0, 1).toUpperCase()}</span><span>BRAND NOTE</span></div>
                    <h3>{settings.business || 'Your business'}</h3>
                    <p>{settings.voice}</p>
                    <div className="apw-brand-preview-line" style={{ background: settings.brandColor }} />
                    <small>{settings.cta}</small>
                  </div>
                  <LocalOnlyNote>Changing defaults does not update existing drafts.</LocalOnlyNote>
                  <div className="apw-guidance-card"><BadgeCheck size={17} /><strong>Advice deserves care.</strong><p>Keep statements verifiable, avoid promising outcomes and review every draft before use.</p></div>
                </aside>
              </form>
            </section>
          )}

          {section === 'activity' && (
            <section className="apw-page apw-page-enter" data-testid="page-activity-history">
              <SectionHeading eyebrow="A small record of local changes" title="Activity history" description="A browser-local trail of demo actions. This is not an audit log and is not shared with an account owner." actions={<AppButton kind="outline" testId="button-clear-activity" onClick={() => { setActivity([]); notify('Local activity history cleared.'); }}><Archive size={15} /> Clear history</AppButton>} />
              <div className="apw-activity-layout">
                <section className="apw-panel apw-activity-list">
                  <div className="apw-panel-head"><div><div className="apw-overline">RECENT EVENTS</div><h2>This browser</h2></div><span className="apw-preview-tag">{activity.length} ITEMS</span></div>
                  {activity.length > 0 ? <div className="apw-timeline">
                    {activity.map((item, index) => <div className="apw-timeline-item" key={item.id} data-testid={`row-activity-${item.id}`}><span className="apw-timeline-rail"><i className={index === 0 ? 'current' : ''} /></span><div><div className="apw-timeline-title">{item.label}</div><p>{item.detail}</p><time>{item.at}</time></div></div>)}
                  </div> : <EmptyMessage title="No activity to show" body="As you explore the preview, local actions will appear here." action="Return to overview" onAction={() => navigate('overview')} />}
                </section>
                <aside className="apw-activity-aside"><div className="apw-activity-side-icon"><Activity size={20} /></div><div className="apw-overline">DEMO HISTORY</div><h3>Useful for orientation. Not an audit trail.</h3><p>Entries use sample timestamps and local events. They are not suitable for regulatory recordkeeping or proof of publication.</p><LocalOnlyNote>History is stored only in this browser.</LocalOnlyNote></aside>
              </div>
            </section>
          )}

          {section === 'owner' && (
            <section className="apw-page apw-page-enter" data-testid="page-owner-preview">
              <SectionHeading eyebrow="Operator view · invented sample data" title="Owner account preview" description="A sketch of workspace administration using fabricated rows. No account actions are available." />
              <div className="apw-owner-warning"><ShieldCheck size={17} /><div><strong>Preview only. No real accounts.</strong><span>These rows are invented for interface review. This page cannot read or administer real users.</span></div><span>LOCAL SAMPLE</span></div>
              <div className="apw-owner-stats">
                <div className="apw-stat-card"><div><span>Sample workspaces</span><Users size={16} /></div><strong>04</strong><small>Invented for this screen</small></div>
                <div className="apw-stat-card"><div><span>Preview seats</span><BadgeCheck size={16} /></div><strong>11</strong><small>No real account records</small></div>
                <div className="apw-stat-card"><div><span>Active billing</span><CreditCard size={16} /></div><strong>00</strong><small>Payments unavailable</small></div>
              </div>
              <section className="apw-panel apw-owner-table-panel">
                <div className="apw-panel-head"><div><div className="apw-overline">SAMPLE DIRECTORY</div><h2>Example workspaces</h2></div><span className="apw-preview-tag">FICTIONAL ROWS</span></div>
                <div className="apw-owner-table">
                  <div className="apw-owner-table-head"><span>WORKSPACE</span><span>OWNER</span><span>PLAN PREVIEW</span><span>STATE</span><span>ACTIONS</span></div>
                  {[
                    { name: 'Northline Financial', owner: 'Morgan Ellis', plan: 'Studio · sample', status: 'Preview' },
                    { name: 'Cedar & Coast Advice', owner: 'Avery Bennett', plan: 'Independent · sample', status: 'Preview' },
                    { name: 'Morrow Planning Co.', owner: 'Riley Hart', plan: 'Studio · sample', status: 'Preview' },
                    { name: 'Plainview Advisory', owner: 'Jamie Brooks', plan: 'Independent · sample', status: 'Preview' },
                  ].map((row, index) => <div className="apw-owner-row" key={row.name} data-testid={`row-owner-sample-${index + 1}`}><div className="apw-owner-name"><span>{row.name.slice(0, 1)}</span><strong>{row.name}</strong></div><span>{row.owner}</span><span>{row.plan}</span><span className="apw-owner-state"><i />{row.status}</span><button disabled title="Account administration unavailable in preview" aria-label={`Manage ${row.name} unavailable in preview`} data-testid={`button-owner-manage-${index + 1}`}>Manage <small>unavailable</small></button></div>)}
                </div>
              </section>
              <div className="apw-owner-foot"><ShieldCheck size={15} /><span>Account creation, suspension, billing and credential management are not implemented.</span></div>
            </section>
          )}

          <footer className="apw-footer"><span>ADPILOT / LOCAL WORKSPACE PREVIEW</span><span>Thoughtful work. Your call.</span><button onClick={() => notify('Local demo · no data leaves this browser.')} data-testid="button-footer-local-info">Privacy in preview <ArrowUpRight size={13} /></button></footer>
        </div>
      </main>

      {editingDraft && <div className="apw-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingDraft(null); }}>
        <form className="apw-modal" onSubmit={saveEditedDraft} aria-labelledby="edit-draft-title" data-testid="form-edit-draft">
          <div className="apw-modal-head"><div><span className="apw-overline">LOCAL DRAFT</span><h2 id="edit-draft-title">Edit the words.</h2></div><button className="apw-icon-button" type="button" onClick={() => setEditingDraft(null)} aria-label="Close edit draft" data-testid="button-close-edit-draft"><X size={17} /></button></div>
          <Field label="Draft title"><input required className="apw-input" value={editingDraft.title} onChange={(event) => setEditingDraft({ ...editingDraft, title: event.target.value })} data-testid="input-edit-draft-title" /></Field>
          <Field label="Caption"><textarea required className="apw-input apw-textarea apw-edit-caption" value={editingDraft.caption} onChange={(event) => setEditingDraft({ ...editingDraft, caption: event.target.value })} data-testid="textarea-edit-draft-caption" /></Field>
          <div className="apw-form-foot"><span>Autosave is off</span><AppButton kind="primary" type="submit" testId="button-save-draft-edit"><Check size={15} /> Save draft</AppButton></div>
        </form>
      </div>}

      {scheduleDraft && <div className="apw-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setScheduleDraft(null); }}>
        <form className="apw-modal apw-schedule-modal" onSubmit={saveSchedule} aria-labelledby="schedule-draft-title" data-testid="form-schedule-draft">
          <div className="apw-modal-head"><div><span className="apw-overline">LOCAL PLANNER</span><h2 id="schedule-draft-title">Choose a reminder.</h2></div><button className="apw-icon-button" type="button" onClick={() => setScheduleDraft(null)} aria-label="Close schedule form" data-testid="button-close-schedule"><X size={17} /></button></div>
          <p className="apw-modal-copy">This date is for your own planning. It will not send or publish anything.</p>
          <Field label="Reminder date and time"><input required type="datetime-local" className="apw-input" value={scheduleValue} onChange={(event) => setScheduleValue(event.target.value)} data-testid="input-schedule-date" /></Field>
          <div className="apw-form-foot"><span>Timezone: {settings.timezone}</span><AppButton kind="primary" type="submit" testId="button-save-schedule"><CalendarDays size={15} /> Save reminder</AppButton></div>
        </form>
      </div>}
      {toast && <div className="apw-toast" role="status" data-testid="status-toast"><Check size={15} /><span>{toast}</span></div>}
    </div>
  );
}

function DraftRow({
  draft,
  index,
  onEdit,
  onDuplicate,
  onArchive,
  onSchedule,
}: {
  draft: Draft;
  index: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onSchedule: () => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  return (
    <div className="apw-draft-row" data-testid={`row-draft-${draft.id}`}>
      <div className="apw-draft-thumb"><Artwork direction={draft.direction} format="square" variation={draft.variation + index} /></div>
      <div className="apw-draft-info"><strong>{draft.title}</strong><span>{draft.direction} <i /> {draft.caption}</span></div>
      <span className="apw-format-pill">{draft.format}</span>
      <span className={`apw-draft-status apw-status-${draft.status}`}><i />{draft.status === 'scheduled' ? 'Planned locally' : draft.status}</span>
      <span className="apw-draft-date">{draft.status === 'scheduled' && draft.scheduledAt ? dateLabel(draft.scheduledAt) : dateLabel(draft.createdAt)}</span>
      <div className="apw-draft-actions">
        <button className="apw-icon-button" onClick={onEdit} aria-label={`Edit ${draft.title}`} title="Edit draft" data-testid={`button-edit-${draft.id}`}><Pencil size={15} /></button>
        <div className="apw-actions-menu-wrap">
          <button className="apw-icon-button" onClick={() => setActionsOpen((open) => !open)} aria-label={`More actions for ${draft.title}`} aria-expanded={actionsOpen} data-testid={`button-more-${draft.id}`}><MoreHorizontal size={17} /></button>
          {actionsOpen && <div className="apw-actions-menu">
            <button onClick={() => { onDuplicate(); setActionsOpen(false); }} data-testid={`button-duplicate-${draft.id}`}><Copy size={14} /> Duplicate</button>
            {draft.status === 'archived' ? <button onClick={() => { setActionsOpen(false); }} data-testid={`button-restore-placeholder-${draft.id}`} disabled><ArrowDownRight size={14} /> Restore unavailable</button> : <button onClick={() => { onSchedule(); setActionsOpen(false); }} data-testid={`button-schedule-${draft.id}`}><CalendarDays size={14} /> {draft.status === 'scheduled' ? 'Edit reminder' : 'Add reminder'}</button>}
            {draft.status !== 'archived' && <button className="is-danger" onClick={() => { onArchive(); setActionsOpen(false); }} data-testid={`button-archive-${draft.id}`}><Archive size={14} /> Archive</button>}
          </div>}
        </div>
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  index,
  onEdit,
  onDuplicate,
  onArchive,
  onSchedule,
}: {
  draft: Draft;
  index: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onSchedule: () => void;
}) {
  return (
    <article className="apw-draft-card" data-testid={`card-draft-${draft.id}`}>
      <div className="apw-draft-card-art"><Artwork direction={draft.direction} format={draft.format} variation={index + draft.variation} /><span className={`apw-draft-status apw-status-${draft.status}`}><i />{draft.status === 'scheduled' ? 'Planned' : draft.status}</span></div>
      <div className="apw-draft-card-copy"><span className="apw-overline">{draft.direction.toUpperCase()}</span><h3>{draft.title}</h3><p>{draft.caption}</p>{draft.creativeOptions && <small style={{ display: 'block', marginTop: 4, color: '#92968d', fontSize: 7 }}>{draft.creativeOptions.style} · {draft.creativeOptions.quality} · {draft.creativeOptions.source === 'session-photo' ? 'session photo' : draft.creativeOptions.source === 'none' ? 'no photo' : 'sample library'}</small>}</div>
      <div className="apw-draft-card-actions"><button onClick={onEdit} data-testid={`button-card-edit-${draft.id}`}><Pencil size={14} /> Edit</button><button onClick={onDuplicate} data-testid={`button-card-duplicate-${draft.id}`}><Copy size={14} /> Duplicate</button><button onClick={onSchedule} data-testid={`button-card-schedule-${draft.id}`}><CalendarDays size={14} /> Plan</button><button onClick={onArchive} aria-label={`Archive ${draft.title}`} data-testid={`button-card-archive-${draft.id}`}><Archive size={14} /></button></div>
    </article>
  );
}

function EmptyMessage({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return <div className="apw-empty-state" data-testid="state-empty"><div className="apw-empty-icon"><FileText size={20} /></div><h3>{title}</h3><p>{body}</p><button onClick={onAction} data-testid="button-empty-action">{action}<ArrowRight size={14} /></button></div>;
}

const styles = `
.apw-root{--ink:#28323a;--muted:#737c7a;--paper:#f5f3ec;--card:#fcfbf7;--line:#e5e1d6;--green:#315f50;--green-dark:#244d40;--mint:#dfece3;--clay:#d78b68;--ochre:#bd9a56;--display:'Manrope',sans-serif;--body:'DM Sans',sans-serif;--mono:'Space Mono',monospace;min-height:100dvh;background:var(--paper);color:var(--ink);font-family:var(--body);font-size:14px;display:flex;line-height:1.5;overflow:hidden}
.apw-root *{box-sizing:border-box}.apw-root button,.apw-root input,.apw-root select,.apw-root textarea{font:inherit}.apw-root button{color:inherit}.apw-sidebar{width:252px;position:fixed;inset:0 auto 0 0;z-index:30;display:flex;flex-direction:column;padding:25px 16px 16px;background:#27323a;color:#ecebe4}.apw-brand-lockup{display:flex;align-items:center;gap:11px;padding:0 10px}.apw-brand-mark{width:34px;height:34px;border-radius:11px;background:#39826a;display:grid;place-items:center;color:#f6f5ef}.apw-wordmark{font-family:var(--display);font-size:18px;font-weight:800;letter-spacing:-.06em}.apw-wordmark span{color:#e0a07b}.apw-mobile-close{display:none}.apw-demo-pill{align-self:flex-start;margin:27px 10px 23px;border:1px solid rgba(216,164,125,.25);background:rgba(216,164,125,.08);border-radius:30px;padding:5px 9px;color:#e6b391;font:9px var(--mono);letter-spacing:.1em}.apw-demo-pill>span,.apw-preview-state>span{display:inline-block;width:6px;height:6px;margin-right:7px;border-radius:50%;background:#d99870;vertical-align:1px}.apw-nav{overflow:auto;scrollbar-width:thin;flex:1}.apw-nav-group{margin-bottom:21px}.apw-nav-heading{padding:0 12px 8px;color:#8f9a9e;font:9px var(--mono);letter-spacing:.14em;text-transform:uppercase}.apw-nav-item{width:100%;height:39px;display:flex;align-items:center;gap:11px;margin:2px 0;padding:0 12px;border:0;border-radius:9px;text-align:left;background:transparent;color:#b8c0bd;font-size:12px;transition:background .18s,color .18s,transform .18s;cursor:pointer}.apw-nav-item:hover{background:rgba(255,255,255,.07);color:#f4f3ed;transform:translateX(2px)}.apw-nav-selected,.apw-nav-selected:hover{background:#365749;color:#f0f4eb}.apw-nav-count{margin-left:auto;border-radius:20px;background:#678773;color:#fff;padding:1px 7px;font:9px var(--mono)}.apw-sidebar-bottom{margin-top:18px}.apw-sidebar-note{padding:14px 13px;border:1px solid rgba(255,255,255,.095);border-radius:13px;background:rgba(255,255,255,.035)}.apw-note-icon{color:#dfa27d}.apw-sidebar-note p{margin:7px 0 10px;color:#c6ccca;font-size:11px;line-height:1.6}.apw-sidebar-note>span{font:8px var(--mono);letter-spacing:.06em;color:#8c9998}.apw-user-chip{display:flex;align-items:center;gap:9px;margin-top:15px;padding:13px 5px 2px;border-top:1px solid rgba(255,255,255,.1)}.apw-avatar{display:grid;place-items:center;width:33px;height:33px;flex:none;border-radius:50%;background:#e0e8d9;color:#355d4d;font:700 11px var(--display)}.apw-user-chip>div:nth-child(2){display:flex;min-width:0;flex:1;flex-direction:column}.apw-user-chip strong{overflow:hidden;color:#f0f0e9;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.apw-user-chip span{color:#9da8a5;font-size:9px}.apw-user-chip>svg{color:#879390}.apw-main{min-width:0;flex:1;margin-left:252px}.apw-topbar{position:sticky;top:0;z-index:20;height:65px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(22px,4.3vw,62px);border-bottom:1px solid var(--line);background:rgba(245,243,236,.94);backdrop-filter:blur(14px)}.apw-breadcrumb{display:flex;align-items:center;gap:11px;font-size:11px;color:#8a918d}.apw-breadcrumb>span{font:9px var(--mono);letter-spacing:.12em;color:#7d8983}.apw-breadcrumb>strong{font-weight:600;color:#39443f}.apw-topbar-right{display:flex;align-items:center;gap:14px}.apw-preview-state{color:#6e7772;font:9px var(--mono);letter-spacing:.02em}.apw-preview-state>span{background:#74a27f}.apw-help-button,.apw-menu-toggle{display:grid;place-items:center;width:34px;height:34px;border:1px solid #deddd3;border-radius:50%;background:#fbfaf5;color:#65736d;cursor:pointer;transition:background .18s,color .18s}.apw-help-button:hover{background:#e5ede4;color:var(--green)}.apw-menu-toggle{display:none}.apw-content{width:min(1500px,100%);min-height:calc(100dvh - 65px);margin:0 auto;padding:20px clamp(22px,4.3vw,62px) 0;display:flex;flex-direction:column}.apw-demo-banner{display:flex;align-items:center;gap:11px;min-height:49px;padding:8px 14px;border:1px solid #d7e4d8;border-radius:11px;background:#eaf1e8;color:#476255}.apw-banner-symbol{display:grid;place-items:center;width:25px;height:25px;flex:none;border-radius:8px;background:#d8e7d9;color:#46745f}.apw-demo-banner p{display:flex;align-items:baseline;gap:8px;min-width:0;margin:0;line-height:1.45}.apw-demo-banner strong{font-size:11px;white-space:nowrap}.apw-demo-banner p span{font-size:10px;color:#6b8074}.apw-banner-right{margin-left:auto;color:#7a8e80;font:8px var(--mono);letter-spacing:.08em;white-space:nowrap}.apw-page{padding-top:35px;animation:apw-rise .36s cubic-bezier(.2,.75,.25,1) both}.apw-page-enter{animation:apw-rise .4s cubic-bezier(.2,.75,.25,1) both}@keyframes apw-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.apw-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:25px}.apw-eyebrow,.apw-overline{display:flex;align-items:center;gap:8px;color:#668171;font:9px var(--mono);letter-spacing:.14em;text-transform:uppercase}.apw-eyebrow>span{width:19px;height:1px;background:#66957c}.apw-heading h1{margin:10px 0 4px;color:#29343a;font:800 clamp(29px,3.2vw,43px)/1.14 var(--display);letter-spacing:-.06em}.apw-heading p{max-width:620px;margin:7px 0 0;color:#77807c;font-size:12px;line-height:1.65}.apw-heading-actions{flex:none}.apw-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 15px;border:1px solid transparent;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;cursor:pointer;transition:background .18s,border-color .18s,transform .18s,color .18s}.apw-button:hover:not(:disabled){transform:translateY(-1px)}.apw-button:disabled{opacity:.6;cursor:not-allowed}.apw-button-primary{background:var(--green);color:#fcfbf5!important;box-shadow:0 3px 0 rgba(34,75,60,.14)}.apw-button-primary:hover:not(:disabled){background:var(--green-dark)}.apw-button-outline{border-color:#d6d9ce;background:#fcfbf7;color:#4e6158}.apw-button-outline:hover{border-color:#9cb9a2;background:#f0f4ec}.apw-button-quiet{background:transparent;color:#52665b}.apw-button-danger{background:#f8eae3;color:#a05f45}.apw-overview-grid{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(230px,.76fr);gap:18px}.apw-overview-main,.apw-overview-side{min-width:0}.apw-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;margin-bottom:17px}.apw-stat-card{min-height:118px;padding:16px 17px;border:1px solid var(--line);border-radius:14px;background:#fbfaf6}.apw-stat-card>div{display:flex;align-items:center;justify-content:space-between;color:#727d77;font-size:10px}.apw-stat-card>div svg{color:#839088}.apw-stat-card>strong{display:block;margin-top:15px;color:#29363a;font:700 30px/.95 var(--display);letter-spacing:-.06em}.apw-stat-card>small{display:block;margin-top:8px;color:#969d96;font-size:9px}.apw-stat-green{background:#edf3eb;border-color:#dfe8dc}.apw-stat-green>div svg{color:#5c8c73}.apw-stat-ochre{background:#f3f0e5;border-color:#e9e3d3}.apw-stat-ochre>div svg{color:#a98c50}.apw-stat-rose{background:#f6eee8;border-color:#ecdfd5}.apw-stat-rose>div svg{color:#ae7d64}.apw-panel{border:1px solid var(--line);border-radius:15px;background:var(--card);box-shadow:0 2px 5px rgba(49,54,42,.018)}.apw-panel-head{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:19px 21px;border-bottom:1px solid #efede5}.apw-panel-head h2{margin:3px 0 0;color:#2d383c;font:700 17px var(--display);letter-spacing:-.04em}.apw-panel-head-lined{border-bottom:1px solid #efede5}.apw-recent-panel{overflow:visible}.apw-text-action{display:inline-flex;align-items:center;gap:5px;border:0;background:none;color:#42705d;font-size:10px;font-weight:700;cursor:pointer}.apw-text-action:hover{color:#284b3d}.apw-draft-row{position:relative;display:grid;grid-template-columns:49px minmax(130px,1fr) 75px 122px 59px 75px;align-items:center;gap:12px;min-height:74px;padding:11px 18px;border-bottom:1px solid #f0eee8;transition:background .18s}.apw-draft-row:last-child{border-bottom:0}.apw-draft-row:hover{background:#f8f7f1}.apw-draft-thumb{width:45px;height:45px;overflow:hidden;border-radius:10px}.apw-draft-thumb .apw-art{min-height:45px;height:45px}.apw-draft-thumb .apw-art-window{height:45px}.apw-draft-thumb .apw-art-copy{display:none}.apw-draft-thumb .apw-art-stamp{display:none}.apw-draft-info{min-width:0}.apw-draft-info strong{display:block;overflow:hidden;color:#3a4548;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.apw-draft-info>span{display:block;overflow:hidden;margin-top:3px;color:#89908a;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.apw-draft-info>span i{display:inline-block;width:3px;height:3px;margin:0 4px 2px;border-radius:50%;background:#a2aa9f}.apw-format-pill{justify-self:start;padding:3px 7px;border-radius:5px;background:#f0efe7;color:#747a72;font:8px var(--mono);text-transform:uppercase}.apw-draft-status{display:inline-flex;align-items:center;gap:6px;width:max-content;padding:4px 8px;border-radius:20px;background:#f0eee5;color:#7d7c67;font:8px var(--mono);white-space:nowrap}.apw-draft-status i{width:5px;height:5px;border-radius:50%;background:currentColor}.apw-status-draft{background:#f7eee3;color:#a47c50}.apw-status-scheduled{background:#e8f1e8;color:#4d8264}.apw-status-archived{background:#efefeb;color:#818781}.apw-draft-date{color:#898e87;font:9px var(--mono)}.apw-draft-actions{display:flex;align-items:center;justify-content:flex-end;gap:1px}.apw-icon-button{display:grid;place-items:center;width:29px;height:29px;border:0;border-radius:8px;background:transparent;color:#78837d;cursor:pointer;transition:background .16s,color .16s}.apw-icon-button:hover{background:#e9eee6;color:#3c725a}.apw-actions-menu-wrap{position:relative}.apw-actions-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:15;width:165px;padding:5px;border:1px solid #e3e1d8;border-radius:10px;background:#fffefa;box-shadow:0 10px 28px rgba(41,49,43,.12);animation:apw-rise .15s ease both}.apw-actions-menu button{display:flex;align-items:center;gap:8px;width:100%;padding:8px 9px;border:0;border-radius:6px;background:none;color:#56635c;text-align:left;font-size:10px;cursor:pointer}.apw-actions-menu button:hover{background:#f0f3ec}.apw-actions-menu button.is-danger{color:#a8654f}.apw-actions-menu button:disabled{opacity:.5;cursor:not-allowed}.apw-next-card{position:relative;min-height:226px;overflow:hidden;padding:20px;border-radius:15px;background:#dfece2;color:#2e4c3d}.apw-next-card-top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;color:#668b73;font:8px var(--mono);letter-spacing:.12em}.apw-next-card-top svg{color:#59856b}.apw-next-card h2{position:relative;z-index:1;max-width:210px;margin:22px 0 8px;font:700 23px/1.12 var(--display);letter-spacing:-.05em}.apw-next-card p{position:relative;z-index:1;max-width:220px;margin:0;color:#668074;font-size:10px;line-height:1.65}.apw-next-card>button{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;margin-top:15px;padding:8px 11px;border:1px solid #b6cdb9;border-radius:20px;background:rgba(249,250,243,.68);color:#3f6751;font-size:9px;font-weight:700;cursor:pointer;transition:background .18s}.apw-next-card>button:hover{background:#fff}.apw-loop{position:absolute;right:-55px;bottom:-130px;border:1px solid rgba(84,130,96,.22);border-radius:50%}.loop-one{width:225px;height:225px}.loop-two{right:-29px;bottom:-103px;width:170px;height:170px}.apw-connection-card{margin-top:12px;padding:16px;border:1px solid var(--line);border-radius:14px;background:#fcfbf7}.apw-connection-inline{display:flex;align-items:center;gap:7px;margin-top:12px}.apw-connection-dot{width:7px;height:7px;border-radius:50%;background:#c88c69}.apw-connection-inline strong{color:#4f5c55;font-size:10px}.apw-connection-inline>span:last-child{margin-left:auto;padding:3px 6px;border-radius:5px;background:#f2eee4;color:#9b8260;font:8px var(--mono)}.apw-connection-card p{margin:8px 0 7px;color:#929892;font-size:9px}.apw-connection-card>button{display:inline-flex;align-items:center;gap:6px;padding:0;border:0;background:none;color:#527963;font-size:9px;font-weight:700;cursor:pointer}.apw-quiet-quote{position:relative;margin-top:12px;padding:13px 15px 12px 35px;border-left:2px solid #d7ab81;background:#f2eee4}.apw-quiet-quote>span{position:absolute;left:13px;top:8px;color:#d19b70;font:30px Georgia,serif}.apw-quiet-quote p{margin:2px 0 7px;color:#667269;font:italic 11px/1.55 var(--display)}.apw-quiet-quote small{color:#a49e8e;font:7px var(--mono);letter-spacing:.1em}.apw-bottom-ribbon{display:flex;align-items:center;gap:11px;margin-top:17px;padding:11px 14px;border:1px solid #e3e1d5;border-radius:10px;background:#f8f6ef;color:#7a837c;font-size:9px}.apw-ribbon-mark{display:grid;place-items:center;width:22px;height:22px;flex:none;border-radius:50%;background:#e4ede1;color:#54816b}.apw-bottom-ribbon strong{color:#53665a}.apw-bottom-ribbon button{display:flex;align-items:center;gap:5px;margin-left:auto;border:0;background:none;color:#537760;font-size:9px;font-weight:700;white-space:nowrap;cursor:pointer}.apw-footer{display:flex;align-items:center;gap:15px;margin-top:auto;padding:25px 0 20px;color:#a2a49b;font:8px var(--mono);letter-spacing:.07em}.apw-footer>span:nth-child(2){margin-left:auto;color:#868f87;font:italic 10px var(--display);letter-spacing:0}.apw-footer button{display:flex;align-items:center;gap:4px;border:0;background:none;color:#7d8b81;font:8px var(--mono);cursor:pointer}.apw-studio-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(260px,.72fr);gap:16px;align-items:start}.apw-studio-form{padding:0 20px 17px}.apw-studio-form>.apw-panel-head{margin:0 -20px 17px;padding:18px 20px}.apw-setup-step,.apw-preview-tag{padding:5px 7px;border:1px solid #e5e3d8;border-radius:5px;color:#899188;font:8px var(--mono);letter-spacing:.05em;white-space:nowrap}.apw-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 13px}.apw-field{display:block;min-width:0;color:#48564e}.apw-field-label{display:block;margin-bottom:6px;color:#55645a;font-size:10px;font-weight:700}.apw-input{display:block;width:100%;min-height:39px;padding:8px 10px;border:1px solid #dedfd5;border-radius:8px;outline:0;background:#fefdfa;color:#37443c;font-size:11px;transition:border .16s,box-shadow .16s}.apw-input:focus{border-color:#83aa92;box-shadow:0 0 0 3px rgba(63,129,93,.1)}.apw-input::placeholder{color:#a4a79e}.apw-input option{color:#303d38}.apw-textarea{min-height:70px;resize:vertical;line-height:1.5}.apw-field-hint{display:block;margin-top:5px;color:#9a9e95;font-size:9px}.apw-form-grid>.apw-field:last-child:nth-child(odd){grid-column:1/-1}.apw-form-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:17px;padding-top:14px;border-top:1px solid #efede5}.apw-form-foot>span{display:flex;align-items:center;gap:6px;color:#89938a;font-size:9px}.apw-form-foot>span svg{color:#6e987a}.apw-studio-aside{display:flex;flex-direction:column;gap:12px}.apw-preview-card{padding:16px;border:1px solid var(--line);border-radius:14px;background:#fbfaf6}.apw-preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:13px}.apw-preview-head h3{margin:4px 0 0;color:#45514a;font:700 12px var(--display)}.apw-preview-card>p{margin:10px 0 0;color:#929890;font-size:9px;line-height:1.55}.apw-art{position:relative;isolation:isolate;display:flex;min-height:180px;overflow:hidden;border-radius:10px;background:#d8e1d3;color:#f8f5e9}.apw-art-square{aspect-ratio:1/1;min-height:0}.apw-art-portrait{aspect-ratio:4/5;min-height:0}.apw-art-landscape{aspect-ratio:1.91/1;min-height:0}.apw-art-window{position:absolute;inset:0 0 37% 0;overflow:hidden;background:linear-gradient(160deg,#c9d9cb 0%,#e8dfc3 53%,#d8b493 100%)}.apw-art-portrait .apw-art-window{inset:0 0 43%}.apw-art-landscape .apw-art-window{inset:0 0 34%}.apw-art-sun{position:absolute;right:14%;top:14%;width:20%;aspect-ratio:1;border-radius:50%;background:#e7bd88;opacity:.9}.apw-art-hill{position:absolute;left:-10%;right:-10%;bottom:-15%;height:65%;border-radius:50% 50% 0 0/42% 42% 0 0;transform:rotate(-6deg)}.apw-art-hill-back{bottom:-5%;background:#8ea99a}.apw-art-hill-front{left:23%;bottom:-36%;background:#516e60;transform:rotate(9deg)}.apw-art-orbit{position:absolute;top:16%;right:13%;width:39%;height:73%;border:1px solid rgba(255,255,255,.54);border-radius:50%;transform:rotate(30deg)}.apw-art-copy{position:absolute;inset:auto 0 0;display:flex;flex-direction:column;gap:5px;padding:10% 9% 8%;background:linear-gradient(180deg,rgba(39,56,47,0),rgba(36,58,46,.98) 28%);color:#f8f5e9}.apw-art-brand{font:7px var(--mono);letter-spacing:.12em;opacity:.8}.apw-art-title{max-width:90%;font:700 clamp(13px,1.3vw,21px)/1.1 var(--display);letter-spacing:-.04em}.apw-art-foot{color:#d9e4d6;font-size:7px}.apw-art-stamp{position:absolute;right:7%;top:7%;padding:4px 5px;border:1px solid rgba(255,255,255,.62);border-radius:3px;color:white;font:6px/1.35 var(--mono);letter-spacing:.06em}.apw-art-variation-1 .apw-art-window{filter:hue-rotate(13deg)}.apw-art-variation-2 .apw-art-window{filter:hue-rotate(-16deg) saturate(.83)}.apw-local-note{display:flex;align-items:flex-start;gap:8px;padding:10px 11px;border:1px solid #e4e7dc;border-radius:9px;background:#f2f4eb;color:#738174;font-size:9px;line-height:1.5}.apw-local-note svg{flex:none;color:#729078}.apw-studio-library{margin-top:17px}.apw-draft-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;padding:14px}.apw-draft-card{overflow:hidden;border:1px solid #eeece3;border-radius:11px;background:#fdfcf8}.apw-draft-card-art{position:relative;padding:8px;background:#f1efe7}.apw-draft-card-art .apw-art{min-height:0;border-radius:7px}.apw-draft-card-art>.apw-draft-status{position:absolute;right:14px;top:14px}.apw-draft-card-copy{padding:10px 11px 9px}.apw-draft-card-copy .apw-overline{display:block;overflow:hidden;font-size:7px;text-overflow:ellipsis;white-space:nowrap}.apw-draft-card-copy h3{overflow:hidden;margin:5px 0 3px;color:#3c4842;font:700 11px var(--display);text-overflow:ellipsis;white-space:nowrap}.apw-draft-card-copy p{display:-webkit-box;min-height:31px;overflow:hidden;margin:0;color:#91968e;font-size:8px;line-height:1.5;-webkit-box-orient:vertical;-webkit-line-clamp:2}.apw-draft-card-actions{display:flex;align-items:center;justify-content:space-between;padding:7px;border-top:1px solid #f0eee7}.apw-draft-card-actions button{display:inline-flex;align-items:center;gap:4px;padding:5px;border:0;border-radius:5px;background:transparent;color:#738079;font-size:8px;cursor:pointer}.apw-draft-card-actions button:hover{background:#eaf0e8;color:#456d56}.apw-empty-state{display:flex;min-height:190px;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}.apw-empty-icon{display:grid;place-items:center;width:43px;height:43px;border-radius:13px;background:#e8eee6;color:#65866e}.apw-empty-state h3{margin:10px 0 3px;color:#45534a;font:700 14px var(--display)}.apw-empty-state p{max-width:340px;margin:0;color:#919890;font-size:10px}.apw-empty-state>button{display:flex;align-items:center;gap:7px;margin-top:12px;padding:7px 12px;border:1px solid #d9e1d5;border-radius:20px;background:#f8faf5;color:#52725b;font-size:9px;font-weight:700;cursor:pointer}.apw-photo-layout{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:15px}.apw-photo-upload{padding:22px}.apw-photo-upload-icon{display:grid;place-items:center;width:42px;height:42px;margin-bottom:18px;border-radius:13px;background:#e4eee3;color:#598269}.apw-photo-upload h2{margin:7px 0;color:#35443d;font:700 21px var(--display);letter-spacing:-.04em}.apw-photo-upload>p{max-width:390px;margin:0 0 18px;color:#808a82;font-size:11px;line-height:1.7}.apw-consent-check{display:flex;align-items:flex-start;gap:9px;padding:12px;border:1px solid #e6e4db;border-radius:9px;background:#f8f7f1;color:#69776d;font-size:10px;line-height:1.55}.apw-consent-check input{width:15px;height:15px;flex:none;margin:1px 0 0;accent-color:#3f775d}.apw-upload-control{position:relative;display:inline-flex;align-items:center;gap:8px;margin-top:15px;padding:10px 15px;border-radius:30px;background:var(--green);color:#fff!important;font-size:10px;font-weight:700;cursor:pointer}.apw-upload-control input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.apw-upload-control.apw-upload-disabled{background:#c4ccc5;cursor:not-allowed}.apw-upload-disabled input{cursor:not-allowed}.apw-small-disclaimer{display:block;margin-top:8px;color:#a0a299;font-size:8px}.apw-photo-preview{padding:0 18px 15px}.apw-photo-preview>.apw-panel-head{margin:0 -18px 14px;padding:18px}.apw-photo-preview .apw-panel-head h2{max-width:360px;overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.apw-session-image-wrap{position:relative;display:flex;min-height:220px;max-height:330px;justify-content:center;overflow:hidden;border-radius:10px;background:#f0efe8}.apw-session-image-wrap img{display:block;max-width:100%;max-height:330px;object-fit:contain}.apw-session-image-wrap>button{position:absolute;top:9px;right:9px;display:grid;place-items:center;width:29px;height:29px;border:1px solid rgba(255,255,255,.7);border-radius:50%;background:rgba(39,51,44,.7);color:#fff;cursor:pointer}.apw-photo-empty{display:flex;min-height:235px;flex-direction:column;align-items:center;justify-content:center;gap:10px;border:1px dashed #d8dbd0;border-radius:10px;background:#f7f6ef;color:#90988e;font-size:10px}.apw-photo-empty svg{color:#91a393}.apw-photo-private{display:flex;align-items:center;gap:7px;margin:12px 0 0;color:#7d8c7c;font-size:9px}.apw-brand-library{margin-top:17px}.apw-photo-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:15px}.apw-photo-tile{overflow:hidden;border:1px solid #eeece4;border-radius:10px;background:#f9f8f2}.apw-photo-tile>.apw-art{min-height:0;border-radius:0}.apw-photo-tile>div:last-child{display:flex;align-items:center;gap:9px;padding:9px 10px}.apw-photo-tile>div:last-child>span{color:#8d998c;font:8px var(--mono)}.apw-photo-tile>div:last-child>strong{overflow:hidden;color:#657269;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.apw-planner-layout{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(190px,.7fr);gap:14px;align-items:stretch}.apw-planner-calendar{overflow:hidden}.apw-week-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));padding:15px 13px 13px;gap:7px}.apw-day{position:relative;min-height:112px;padding:9px 7px;border:1px solid #efede5;border-radius:8px;background:#fbfaf5}.apw-day>span{display:block;color:#9a9e96;font:7px var(--mono);letter-spacing:.07em}.apw-day>strong{display:block;margin-top:4px;color:#505e55;font:700 15px var(--display)}.apw-day-today{border-color:#c6d9c8;background:#edf4eb}.apw-day-today>strong{color:#437351}.apw-day-placeholder{margin-top:12px;color:#a5aca3;font-size:8px}.apw-calendar-event{display:-webkit-box;overflow:hidden;margin-top:8px;padding:5px;border-radius:5px;background:#e2eddf;color:#4f7758;font-size:7px;line-height:1.3;-webkit-box-orient:vertical;-webkit-line-clamp:2}.apw-calendar-event span{display:inline-block;width:4px;height:4px;margin-right:4px;border-radius:50%;background:#74a577;vertical-align:2px}.apw-planner-foot{display:flex;justify-content:space-between;padding:0 18px 14px;color:#90968e;font-size:8px}.apw-planner-foot span{display:flex;align-items:center;gap:6px}.apw-dot-scheduled{width:6px;height:6px;border-radius:50%;background:#76a579}.apw-planner-aside{display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;gap:15px;padding:17px;border:1px solid #e7e1d4;border-radius:14px;background:#f1eee4}.apw-planner-callout{display:flex;gap:10px;color:#68806c}.apw-planner-callout>svg{flex:none;margin-top:2px}.apw-planner-callout strong{color:#4b6252;font:700 12px var(--display)}.apw-planner-callout p{margin:5px 0 0;color:#818b80;font-size:9px;line-height:1.6}.apw-draft-list-panel{margin-top:16px;overflow:visible}.apw-planner-list-heading{flex-wrap:wrap}.apw-list-tools{display:flex;gap:7px}.apw-search,.apw-filter{min-height:33px;padding:0 9px;border:1px solid #e3e2d9;border-radius:7px;outline:0;background:#fbfaf6;color:#65716a;font-size:9px}.apw-search{width:148px}.apw-search:focus,.apw-filter:focus{border-color:#9ebba3}.apw-table-head{display:grid;grid-template-columns:minmax(130px,1fr) 75px 122px 59px 75px;gap:12px;padding:10px 18px 8px 79px;border-bottom:1px solid #efeee7;color:#9ca198;font:8px var(--mono);letter-spacing:.08em}.apw-table-head span:nth-child(2),.apw-table-head span:nth-child(3),.apw-table-head span:nth-child(4){text-align:left}.apw-brief-form{margin-bottom:15px;padding:0 19px 16px}.apw-brief-form>.apw-panel-head{margin:0 -19px 15px;padding:16px 19px}.apw-brief-fields{grid-template-columns:repeat(3,minmax(0,1fr))}.apw-brief-layout{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(230px,.65fr);gap:15px;align-items:start}.apw-brief-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.apw-brief-card{padding:17px}.apw-brief-card-top{display:flex;align-items:center;justify-content:space-between}.apw-brief-index{color:#829184;font:8px var(--mono);letter-spacing:.1em}.apw-brief-status{padding:4px 7px;border-radius:5px;background:#f2eee3;color:#9b835a;font:8px var(--mono)}.apw-brief-status.is-ready{background:#e8f0e6;color:#5d8060}.apw-brief-card h2{margin:15px 0;color:#33413a;font:700 17px var(--display);letter-spacing:-.04em}.apw-brief-detail{padding:10px 0;border-top:1px solid #efede5}.apw-brief-detail>span{color:#96a096;font:8px var(--mono);text-transform:uppercase;letter-spacing:.07em}.apw-brief-detail p{margin:4px 0 0;color:#67746b;font-size:10px;line-height:1.55}.apw-brief-card-foot{display:flex;align-items:center;justify-content:space-between;margin:9px -17px -17px;padding:11px 17px;border-top:1px solid #efede5;background:#f9f8f2;border-radius:0 0 14px 14px}.apw-autopilot-state{display:flex;align-items:center;gap:7px;color:#738077;font-size:9px}.apw-autopilot-state>span{width:7px;height:7px;border-radius:50%;background:#c88c69}.apw-autopilot-state>span.is-on{background:#69a274}.apw-autopilot-state small{padding:2px 4px;border-radius:3px;background:#f0eee6;color:#8c9087;font:7px var(--mono)}.apw-toggle{position:relative;width:34px;height:19px;padding:0;border:0;border-radius:20px;background:#d8dbd2;cursor:pointer;transition:background .18s}.apw-toggle>span{position:absolute;top:3px;left:3px;width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.16);transition:transform .18s}.apw-toggle[aria-checked=true]{background:#6b9b77}.apw-toggle[aria-checked=true]>span{transform:translateX(15px)}.apw-autopilot-explainer{padding:19px;border:1px solid #dfe8dc;border-radius:14px;background:#edf3e9}.apw-explainer-icon{display:grid;place-items:center;width:34px;height:34px;margin-bottom:16px;border-radius:10px;background:#dbe9d8;color:#5c8766}.apw-autopilot-explainer h3{margin:8px 0;color:#3a5041;font:700 19px/1.17 var(--display);letter-spacing:-.04em}.apw-autopilot-explainer p{margin:0;color:#758477;font-size:10px;line-height:1.7}.apw-explainer-rule{height:1px;margin:16px 0 10px;background:#dce5d8}.apw-autopilot-explainer>span:last-child{color:#869582;font:7px var(--mono);letter-spacing:.08em}.apw-brief-aside>.apw-local-note{margin-top:11px}.apw-paid-layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(260px,.72fr);gap:15px;align-items:start}.apw-paid-form{padding:0 20px 17px}.apw-paid-form>.apw-panel-head{margin:0 -20px 16px;padding:18px 20px}.apw-paid-status{display:flex;align-items:center;gap:6px;color:#a48762;font:8px var(--mono);white-space:nowrap}.apw-paid-status>span{width:6px;height:6px;border-radius:50%;background:#c48d5d}.apw-paid-form>.apw-field{margin-bottom:14px}.apw-money-input{position:relative}.apw-money-input>span{position:absolute;z-index:1;left:10px;top:8px;color:#76847a;font-size:11px}.apw-money-input>.apw-input{padding-left:26px}.apw-financial-warning{display:flex;gap:10px;margin-top:15px;padding:11px;border:1px solid #eadbc8;border-radius:9px;background:#faf3e9;color:#a77e51}.apw-financial-warning>svg{flex:none;margin-top:2px}.apw-financial-warning p{display:flex;flex-direction:column;gap:2px;margin:0}.apw-financial-warning strong{color:#836849;font-size:9px}.apw-financial-warning span{color:#9c896e;font-size:8px}.apw-paid-summary{overflow:hidden;padding:0 18px 17px}.apw-paid-summary-art{position:relative;display:flex;align-items:center;justify-content:space-between;height:106px;margin:0 -18px 17px;padding:17px 19px;background:#394c48;color:#dce6d7}.apw-paid-summary-art>span{align-self:flex-start;color:#b4c8b3;font:8px var(--mono);letter-spacing:.1em}.apw-paid-summary-art>svg{position:absolute;right:20px;top:20px;color:#b6c7a9}.apw-chart-lines{position:absolute;left:20px;right:20px;bottom:16px;height:37px;display:flex;align-items:flex-end;gap:7px}.apw-chart-lines i{flex:1;height:35%;border-top:1px solid rgba(216,231,208,.25);border-left:1px solid rgba(216,231,208,.3);transform:skewY(-12deg)}.apw-chart-lines i:nth-child(2){height:48%}.apw-chart-lines i:nth-child(3){height:42%}.apw-chart-lines i:nth-child(4){height:77%}.apw-chart-lines i:nth-child(5){height:90%;border-color:#d4b587}.apw-paid-summary h2{margin:7px 0 13px;color:#344139;font:700 19px var(--display);letter-spacing:-.04em}.apw-summary-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid #eeece4;color:#899087;font-size:9px}.apw-summary-row strong{color:#59675d;font-size:9px}.apw-unavailable{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;min-height:60px;gap:2px;margin-top:15px;border:1px solid #e9e3d8;border-radius:9px;background:#f2f0e9;color:#989990;cursor:not-allowed!important}.apw-unavailable>span:first-child{font-size:10px;font-weight:700}.apw-unavailable small{color:#a49e91;font:7px var(--mono);letter-spacing:.09em}.apw-summary-note{margin:10px 0 0;color:#9a9c92;font-size:8px;line-height:1.55;text-align:center}.apw-connection-header{display:flex;align-items:center;gap:13px;margin-bottom:13px;padding:15px;border:1px solid #e5e3d9;border-radius:13px;background:#fbfaf6}.apw-connection-header-icon{display:grid;place-items:center;width:39px;height:39px;border-radius:11px;background:#eeeae0;color:#758078}.apw-connection-header>div:nth-child(2){display:flex;flex-direction:column;gap:2px}.apw-connection-header>div:nth-child(2)>strong{color:#4b5a51;font:700 12px var(--display)}.apw-connection-header>div:nth-child(2)>span{color:#929990;font-size:9px}.apw-status-chip{display:flex;align-items:center;gap:6px;margin-left:auto;padding:5px 8px;border-radius:5px;background:#f3eee6;color:#947b5c;font:8px var(--mono)}.apw-status-chip i{width:5px;height:5px;border-radius:50%;background:#c78d66}.apw-channel-list{display:flex;flex-direction:column;gap:10px}.apw-channel-card{display:grid;grid-template-columns:42px minmax(180px,1fr) 120px 125px;align-items:center;gap:14px;padding:15px 17px}.apw-channel-logo{display:grid;place-items:center;width:37px;height:37px;border-radius:11px;font:700 14px var(--display)}.apw-channel-facebook{background:#e5ece4;color:#66816b}.apw-channel-instagram{background:#eee8de;color:#947a68}.apw-channel-linkedin{background:#e5ebe8;color:#667d74;font-size:11px}.apw-channel-copy h2{margin:0;color:#415047;font:700 12px var(--display)}.apw-channel-copy>span{display:block;margin-top:2px;color:#9a9d93;font-size:8px}.apw-channel-copy p{margin:5px 0 0;color:#858d85;font-size:9px}.apw-channel-disconnected{display:flex;align-items:center;gap:6px;color:#868e86;font-size:9px;white-space:nowrap}.apw-channel-disconnected i{width:6px;height:6px;border-radius:50%;background:#c18b68}.apw-unavailable-small{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:37px;border:1px solid #e5e3da;border-radius:7px;background:#f4f2eb;color:#94978e;font-size:9px;cursor:not-allowed!important}.apw-unavailable-small span{font:7px var(--mono);color:#aaa596}.apw-safety-strip{display:flex;align-items:flex-start;gap:10px;margin-top:15px;padding:12px 14px;border:1px solid #dce6da;border-radius:10px;background:#edf3ea;color:#617968}.apw-safety-strip svg{flex:none;margin-top:1px}.apw-safety-strip p{margin:0;color:#748376;font-size:9px;line-height:1.6}.apw-safety-strip strong{color:#49634f}.apw-settings-layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(230px,.65fr);gap:15px;align-items:start}.apw-settings-form{padding:0 20px 17px}.apw-settings-form>.apw-panel-head{margin:0 -20px 17px;padding:18px 20px}.apw-color-field{display:flex;align-items:center;gap:9px;min-height:39px;padding:4px 9px;border:1px solid #dedfd5;border-radius:8px;background:#fefdfa}.apw-color-field input{width:25px;height:25px;padding:0;border:0;background:transparent;cursor:pointer}.apw-color-field code{color:#737b73;font:9px var(--mono)}.apw-settings-aside{display:flex;flex-direction:column;gap:11px}.apw-brand-preview-card{padding:17px;border:1px solid var(--line);border-radius:13px;background:#fcfbf6}.apw-brand-preview-top{display:flex;align-items:center;justify-content:space-between;color:#a1a298;font:8px var(--mono);letter-spacing:.08em}.apw-brand-preview-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;color:#fff;font:700 12px var(--display)}.apw-brand-preview-card h3{margin:14px 0 2px;color:#405047;font:700 16px var(--display);letter-spacing:-.04em}.apw-brand-preview-card p{margin:0;color:#858d83;font-size:10px}.apw-brand-preview-line{width:31px;height:3px;margin:14px 0 8px;border-radius:2px}.apw-brand-preview-card small{color:#708276;font-size:9px}.apw-guidance-card{display:grid;grid-template-columns:20px 1fr;gap:8px;padding:13px;border:1px solid #ebdfd0;border-radius:10px;background:#f6f0e5;color:#9a7d5b}.apw-guidance-card>svg{grid-row:span 2}.apw-guidance-card strong{color:#806b4d;font-size:10px}.apw-guidance-card p{grid-column:2;margin:0;color:#978a72;font-size:9px;line-height:1.6}.apw-activity-layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(220px,.7fr);gap:15px;align-items:start}.apw-activity-list{overflow:hidden}.apw-timeline{padding:6px 19px 18px}.apw-timeline-item{display:grid;grid-template-columns:20px minmax(0,1fr);gap:11px;min-height:79px}.apw-timeline-rail{position:relative;display:flex;justify-content:center;padding-top:16px}.apw-timeline-rail:after{position:absolute;top:23px;bottom:-3px;width:1px;background:#e5e7dd;content:''}.apw-timeline-item:last-child .apw-timeline-rail:after{display:none}.apw-timeline-rail i{position:relative;z-index:1;width:9px;height:9px;border:2px solid #fdfcf7;border-radius:50%;background:#a3b5a1;box-shadow:0 0 0 1px #a7bba5}.apw-timeline-rail i.current{background:#5f9872;box-shadow:0 0 0 1px #5f9872}.apw-timeline-title{padding-top:10px;color:#45534b;font-size:11px;font-weight:700}.apw-timeline-item p{margin:3px 0;color:#838d84;font-size:9px}.apw-timeline-item time{color:#a0a399;font:8px var(--mono)}.apw-activity-aside{padding:18px;border:1px solid #e7e2d7;border-radius:14px;background:#f0eee5}.apw-activity-side-icon{display:grid;place-items:center;width:37px;height:37px;margin-bottom:16px;border-radius:11px;background:#e2e9dd;color:#63816b}.apw-activity-aside h3{margin:8px 0;color:#45554a;font:700 19px/1.18 var(--display);letter-spacing:-.04em}.apw-activity-aside>p{margin:0 0 14px;color:#838b80;font-size:10px;line-height:1.7}.apw-owner-warning{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:12px 14px;border:1px solid #ead9c5;border-radius:10px;background:#f7f0e5;color:#9b7950}.apw-owner-warning>svg{flex:none}.apw-owner-warning>div{display:flex;flex-direction:column}.apw-owner-warning strong{color:#785f40;font-size:10px}.apw-owner-warning>div span{color:#998b73;font-size:9px}.apw-owner-warning>span:last-child{margin-left:auto;padding:4px 6px;border:1px solid #eadcc8;border-radius:4px;color:#a08762;font:7px var(--mono);white-space:nowrap}.apw-owner-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}.apw-owner-stats .apw-stat-card{min-height:101px}.apw-owner-stats .apw-stat-card>strong{font-size:25px}.apw-owner-table-panel{overflow:hidden}.apw-owner-table-head,.apw-owner-row{display:grid;grid-template-columns:minmax(150px,1.3fr) minmax(115px,1fr) minmax(115px,1fr) 90px 110px;align-items:center;gap:12px;padding:10px 16px}.apw-owner-table-head{border-bottom:1px solid #efede5;color:#9ca198;font:8px var(--mono);letter-spacing:.07em}.apw-owner-row{min-height:58px;border-bottom:1px solid #f0eee8;color:#747e76;font-size:9px}.apw-owner-row:last-child{border-bottom:0}.apw-owner-name{display:flex;align-items:center;gap:8px;min-width:0}.apw-owner-name>span{display:grid;place-items:center;width:27px;height:27px;flex:none;border-radius:8px;background:#e8eee4;color:#61806a;font:700 10px var(--display)}.apw-owner-name>strong{overflow:hidden;color:#48564c;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.apw-owner-state{display:flex;align-items:center;gap:6px;color:#8e948a;font-size:8px}.apw-owner-state i{width:5px;height:5px;border-radius:50%;background:#c99370}.apw-owner-row>button{display:flex;flex-direction:column;align-items:center;padding:5px;border:1px solid #e8e5dc;border-radius:6px;background:#f4f2ec;color:#a3a397;font-size:8px;cursor:not-allowed!important}.apw-owner-row>button small{font:6px var(--mono)}.apw-owner-foot{display:flex;align-items:center;gap:8px;margin-top:13px;color:#898f86;font-size:9px}.apw-owner-foot svg{color:#819b83}.apw-modal-overlay{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px;background:rgba(33,42,39,.48);backdrop-filter:blur(3px);animation:apw-fade .16s ease both}@keyframes apw-fade{from{opacity:0}to{opacity:1}}.apw-modal{width:min(100%,500px);padding:20px;border:1px solid #e4e2d8;border-radius:15px;background:#fcfbf7;box-shadow:0 25px 80px rgba(32,40,34,.23);animation:apw-rise .22s ease both}.apw-modal-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px}.apw-modal-head h2{margin:5px 0 0;color:#344139;font:700 22px var(--display);letter-spacing:-.04em}.apw-modal>.apw-field{margin:13px 0}.apw-edit-caption{min-height:130px}.apw-modal-copy{margin:-7px 0 17px;color:#818a81;font-size:10px}.apw-toast{position:fixed;z-index:100;right:22px;bottom:20px;display:flex;align-items:center;gap:9px;max-width:min(420px,calc(100vw - 32px));padding:12px 15px;border:1px solid #dbe5d8;border-radius:10px;background:#f5f8f0;color:#52725b;box-shadow:0 10px 25px rgba(48,64,49,.12);font-size:10px;animation:apw-rise .2s ease both}.apw-toast svg{flex:none;color:#66936f}.apw-button-pulse{width:8px;height:8px;border-radius:50%;background:#d8aa71;animation:apw-pulse .7s ease-in-out infinite alternate}@keyframes apw-pulse{to{opacity:.35;transform:scale(.7)}}.apw-mobile-scrim{display:none}
@media(max-width:1150px){.apw-sidebar{width:228px}.apw-main{margin-left:228px}.apw-draft-row{grid-template-columns:43px minmax(110px,1fr) 65px 108px 55px 67px;gap:8px;padding-right:12px;padding-left:12px}.apw-draft-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.apw-overview-grid{grid-template-columns:minmax(0,1.5fr) minmax(215px,.7fr)}.apw-owner-table-head,.apw-owner-row{grid-template-columns:minmax(140px,1.2fr) minmax(100px,1fr) minmax(100px,1fr) 78px 95px;gap:8px}}
@media(max-width:900px){.apw-sidebar{width:255px;transform:translateX(-102%);transition:transform .25s cubic-bezier(.2,.75,.25,1);box-shadow:12px 0 36px rgba(32,40,37,.12)}.apw-sidebar-open{transform:translateX(0)}.apw-main{margin-left:0}.apw-mobile-close{display:grid;place-items:center;width:31px;height:31px;margin-left:auto;border:0;border-radius:8px;background:rgba(255,255,255,.08);color:#cbd2cd}.apw-mobile-scrim{position:fixed;inset:0;z-index:25;display:block;border:0;background:rgba(24,31,30,.45)}.apw-menu-toggle{display:grid}.apw-overview-grid{grid-template-columns:minmax(0,1.4fr) minmax(205px,.75fr)}.apw-draft-row{grid-template-columns:42px minmax(100px,1fr) 60px 108px 62px;gap:8px}.apw-draft-date{display:none}.apw-table-head{grid-template-columns:minmax(100px,1fr) 60px 108px 62px;padding-left:68px}.apw-table-head span:nth-child(4){display:none}.apw-settings-layout,.apw-paid-layout{grid-template-columns:minmax(0,1.35fr) minmax(220px,.7fr)}.apw-brief-layout{grid-template-columns:1fr}.apw-brief-aside{display:grid;grid-template-columns:1fr 1fr;gap:10px}.apw-brief-aside>.apw-local-note{margin:0;align-self:start}}
@media(max-width:700px){.apw-topbar{height:58px;padding:0 16px}.apw-content{min-height:calc(100dvh - 58px);padding:14px 15px 0}.apw-demo-banner{align-items:flex-start;padding:9px 10px}.apw-demo-banner p{display:block}.apw-demo-banner p strong{display:block}.apw-demo-banner p span{display:block;margin-top:2px}.apw-banner-right{display:none}.apw-page{padding-top:26px}.apw-heading{align-items:flex-start;flex-direction:column;gap:13px;margin-bottom:19px}.apw-heading h1{font-size:32px}.apw-heading-actions{align-self:stretch}.apw-heading-actions .apw-button{width:100%}.apw-overview-grid,.apw-studio-layout,.apw-photo-layout,.apw-planner-layout,.apw-paid-layout,.apw-settings-layout,.apw-activity-layout{grid-template-columns:1fr}.apw-overview-side{display:grid;grid-template-columns:1fr 1fr;gap:10px}.apw-next-card{grid-column:1/-1;min-height:205px}.apw-connection-card,.apw-quiet-quote{margin-top:0}.apw-stat-grid{gap:7px}.apw-stat-card{min-height:105px;padding:12px}.apw-stat-card>div{font-size:8px}.apw-stat-card>strong{font-size:25px}.apw-stat-card>small{font-size:8px}.apw-draft-row{grid-template-columns:39px minmax(0,1fr) 64px;gap:8px;padding:10px}.apw-draft-thumb{width:38px;height:38px}.apw-draft-thumb .apw-art,.apw-draft-thumb .apw-art-window{height:38px}.apw-draft-info>span{max-width:100%;font-size:8px}.apw-format-pill,.apw-draft-date{display:none}.apw-draft-status{font-size:7px}.apw-draft-actions{grid-column:2/4;justify-content:flex-end;margin-top:-2px}.apw-table-head{display:none}.apw-draft-grid{padding:10px;gap:8px}.apw-draft-card-actions button{font-size:8px}.apw-draft-card-actions{gap:1px}.apw-draft-card-actions button:last-child{margin-left:auto}.apw-studio-form{padding:0 14px 14px}.apw-studio-form>.apw-panel-head{margin:0 -14px 14px;padding:15px 14px}.apw-form-grid{gap:12px}.apw-studio-aside{display:grid;grid-template-columns:1fr}.apw-art{min-height:170px}.apw-art-square{min-height:0}.apw-photo-grid{gap:7px;padding:9px}.apw-photo-tile>div:last-child{padding:7px}.apw-photo-tile>div:last-child>strong{font-size:8px}.apw-week-grid{gap:4px;padding:10px 8px}.apw-day{min-height:93px;padding:7px 4px}.apw-day>span{font-size:6px}.apw-day>strong{font-size:13px}.apw-calendar-event{padding:4px 3px;font-size:6px}.apw-planner-list-heading{align-items:flex-start;flex-direction:column}.apw-list-tools{width:100%}.apw-search{flex:1;width:auto}.apw-filter{max-width:120px}.apw-brief-list{grid-template-columns:1fr}.apw-brief-fields{grid-template-columns:1fr}.apw-brief-aside{grid-template-columns:1fr}.apw-connection-card{margin-top:0}.apw-channel-card{grid-template-columns:38px minmax(0,1fr) 100px;gap:9px;padding:12px}.apw-channel-copy p{line-height:1.4}.apw-channel-disconnected{grid-column:2;grid-row:2}.apw-unavailable-small{grid-column:3;grid-row:1/3}.apw-settings-form{padding:0 14px 14px}.apw-settings-form>.apw-panel-head{margin:0 -14px 14px;padding:15px 14px}.apw-paid-form{padding:0 14px 14px}.apw-paid-form>.apw-panel-head{margin:0 -14px 14px;padding:15px 14px}.apw-owner-warning{align-items:flex-start}.apw-owner-warning>span:last-child{display:none}.apw-owner-stats{gap:7px}.apw-owner-table-panel{overflow:auto}.apw-owner-table{min-width:690px}.apw-owner-table-head,.apw-owner-row{grid-template-columns:150px 115px 120px 75px 90px}.apw-footer{gap:8px;flex-wrap:wrap;padding:22px 0 15px;font-size:7px}.apw-footer>span:nth-child(2){margin-left:auto}.apw-footer button{width:100%;justify-content:flex-start;padding:0}.apw-bottom-ribbon{align-items:flex-start;flex-wrap:wrap}.apw-bottom-ribbon>span:nth-child(2){flex:1;min-width:calc(100% - 50px)}.apw-bottom-ribbon button{margin-left:32px}.apw-photo-upload{padding:17px}.apw-photo-preview{padding:0 12px 12px}.apw-photo-preview>.apw-panel-head{margin:0 -12px 12px;padding:14px}.apw-owner-warning>div span{line-height:1.5}}
@media(max-width:430px){.apw-overview-side{grid-template-columns:1fr}.apw-connection-card,.apw-quiet-quote{padding:13px}.apw-stat-grid{grid-template-columns:1fr 1fr}.apw-stat-grid .apw-stat-card:last-child{grid-column:1/-1;min-height:90px}.apw-form-grid{grid-template-columns:1fr}.apw-form-grid>.apw-field:last-child:nth-child(odd){grid-column:auto}.apw-photo-grid{grid-template-columns:1fr}.apw-photo-tile>.apw-art{aspect-ratio:1.5/1}.apw-photo-preview .apw-panel-head h2{max-width:205px}.apw-week-grid{grid-template-columns:repeat(7,minmax(40px,1fr));overflow-x:auto}.apw-planner-calendar{overflow:hidden}.apw-day{min-height:85px}.apw-draft-grid{grid-template-columns:1fr}.apw-draft-card-art>.apw-art{aspect-ratio:1.6/1}.apw-owner-stats .apw-stat-card{padding:10px}.apw-owner-stats .apw-stat-card>div{font-size:7px}.apw-owner-stats .apw-stat-card>strong{font-size:21px}.apw-owner-stats .apw-stat-card>small{font-size:7px}.apw-channel-card{grid-template-columns:35px minmax(0,1fr) 82px;gap:8px;padding:10px}.apw-channel-copy p{font-size:8px}.apw-unavailable-small{font-size:8px}.apw-form-foot{align-items:flex-start}.apw-form-foot .apw-button{min-height:37px;padding:0 11px;font-size:9px}.apw-breadcrumb{gap:7px;font-size:10px}.apw-preview-state{font-size:8px}.apw-topbar-right{gap:8px}}
@media(prefers-reduced-motion:reduce){.apw-root *,.apw-root *:before,.apw-root *:after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
`;
