import {
  Home as HomeIcon,
  Smile,
  Globe as GlobeIcon,
  Search as SearchIcon,
  Library as LibraryIcon,
  BarChart3,
  Shield as ShieldSource,
  Play as PlayIcon,
  Pause as PauseIcon,
  SkipForward,
  SkipBack,
  Heart as HeartIcon,
  Plus as PlusIcon,
  Check as CheckIcon,
  X as XIcon,
  Info as InfoIcon,
  Sparkles,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  LogOut,
  Settings as SettingsIcon,
  MoreHorizontal,
  RefreshCw,
  Undo2,
  Clock as ClockIcon,
  Star as StarIcon,
  List as ListIcon,
  Database as DatabaseIcon,
  Save as SaveIcon,
  Volume2,
  VolumeX,
  ThumbsDown,
  Film as FilmIcon,
  Wifi as WifiIcon,
  ArrowRight,
  Music as MusicIcon,
  Mic as MicIcon,
  BookOpen as BookOpenIcon,
  Menu as MenuIcon,
} from 'lucide-react';
import { AppIcon } from './mana/Icon';

const wrap = (icon) => (props) => <AppIcon icon={icon} {...props} />;

// Compatibility names keep existing components stable while all UI icons use Mana.
export const Home = wrap(HomeIcon);
export const Mood = wrap(Smile);
export const Globe = wrap(GlobeIcon);
export const Search = wrap(SearchIcon);
export const Library = wrap(LibraryIcon);
export const Chart = wrap(BarChart3);
export const Shield = wrap(ShieldSource);
export const Play = (props) => <AppIcon icon={PlayIcon} fill="currentColor" {...props} />;
export const Pause = wrap(PauseIcon);
export const Next = wrap(SkipForward);
export const Prev = wrap(SkipBack);
export const Heart = ({ filled, ...props }) => <AppIcon icon={HeartIcon} fill={filled ? 'currentColor' : 'none'} {...props} />;
export const Plus = wrap(PlusIcon);
export const Check = wrap(CheckIcon);
export const X = wrap(XIcon);
export const Info = wrap(InfoIcon);
export const Spark = wrap(Sparkles);
export const Eye = wrap(EyeIcon);
export const EyeOff = wrap(EyeOffIcon);
export const Logout = wrap(LogOut);
export const Settings = wrap(SettingsIcon);
export const More = wrap(MoreHorizontal);
export const Refresh = wrap(RefreshCw);
export const Undo = wrap(Undo2);
export const Clock = wrap(ClockIcon);
export const Star = ({ filled, ...props }) => <AppIcon icon={StarIcon} fill={filled ? 'currentColor' : 'none'} {...props} />;
export const List = wrap(ListIcon);
export const Database = wrap(DatabaseIcon);
export const Save = wrap(SaveIcon);
export const Volume = wrap(Volume2);
export const VolumeOff = wrap(VolumeX);
export const ThumbDown = wrap(ThumbsDown);
export const Film = wrap(FilmIcon);
export const Wifi = wrap(WifiIcon);
export const Arrow = wrap(ArrowRight);
export const Music = wrap(MusicIcon);
export const Mic = wrap(MicIcon);
export const BookOpen = wrap(BookOpenIcon);
export const Menu = wrap(MenuIcon);

// Product mark is deliberately custom artwork, not a third-party provider logo.
export const BrandMark = (props) => (
  <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
    <rect width="64" height="64" rx="18" fill="#181818" />
    <path d="M9 32c0-12 13-19 23-8l0 0c10 11 23 4 23-8M9 32c0 12 13 19 23 8l0 0c10-11 23-4 23 8"
      fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Backward-compatible name used by the sidebar.
export const AdminShield = wrap(ShieldSource);
