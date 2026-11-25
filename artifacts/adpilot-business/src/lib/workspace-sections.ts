import {
  Activity,
  BarChart3,
  CalendarDays,
  FileImage,
  FileText,
  LayoutDashboard,
  Radio,
  Settings2,
  Sparkles,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type PreviewSection =
  | 'overview'
  | 'studio'
  | 'photos'
  | 'planner'
  | 'briefs'
  | 'paid'
  | 'connections'
  | 'brand'
  | 'activity'
  | 'owner';

export const workspaceSections: {
  id: PreviewSection;
  label: string;
  icon: LucideIcon;
  group: 'Workspace' | 'Campaigns' | 'Business';
  path: string;
}[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Workspace', path: '/' },
  { id: 'studio', label: 'Creative studio', icon: Sparkles, group: 'Workspace', path: '/studio' },
  { id: 'photos', label: 'Brand photographs', icon: FileImage, group: 'Workspace', path: '/photos' },
  { id: 'planner', label: 'Publishing planner', icon: CalendarDays, group: 'Workspace', path: '/planner' },
  { id: 'briefs', label: 'Campaign briefs', icon: FileText, group: 'Campaigns', path: '/briefs' },
  { id: 'paid', label: 'Paid campaign plan', icon: BarChart3, group: 'Campaigns', path: '/paid' },
  { id: 'connections', label: 'Channels', icon: Radio, group: 'Business', path: '/connections' },
  { id: 'brand', label: 'Brand & defaults', icon: Settings2, group: 'Business', path: '/brand' },
  { id: 'activity', label: 'Activity history', icon: Activity, group: 'Business', path: '/activity' },
  { id: 'owner', label: 'Owner preview', icon: Users, group: 'Business', path: '/owner' },
];
