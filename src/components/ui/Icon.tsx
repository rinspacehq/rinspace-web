import {
  ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpRight, AtSign, Award, BadgeCheck, BadgeHelp, Bell, Book, Bookmark,
  BookmarkCheck, Camera, Check, CheckCircle, CheckSquare, ChevronDown, ChevronLeft, ChevronRight,
  ChevronUp, Circle, CircleHelp, Clipboard, ClipboardCheck, CloudUpload, CodeSquare, Columns3, CornerUpRight,
  BadgeAlert, ExternalLink, File, FileCode2, FilePlus2, FileText, FileType2, Flag, Flame, Folder, FolderCheck,
  FolderOpen, FolderPlus, FolderSymlink, Frown, Gift, GitBranch, Globe2, GripVertical, HardDrive, Heart, History,
  Image, Inbox, Kanban, LayoutPanelLeft, Link, Lock, LogIn, LogOut, Maximize, Megaphone, Minimize,
  Menu, MessageCircleMore, MessageSquareText, Minus, NotebookText, PanelLeft, PanelLeftClose,
  PanelLeftOpen, Pause, Pencil, Plus, PlusCircle, Ratio, RefreshCw, Repeat2, Reply, Search, Send,
  Share, ShieldAlert, ShieldLock, Sliders, Smile, SortAsc, SortDesc, Square, Star, Stars, Tags,
  ThumbsDown, ThumbsUp, Trash, TriangleAlert, Upload, User, UserCheck, UserLock, UserPlus, Users, X,
  XSquare, type LucideIcon, type LucideProps,
} from 'lucide-react';
import { motion } from 'motion/react';

const icons = {
  'arrow-clockwise': RefreshCw, 'arrow-left': ArrowLeft, 'arrow-left-right': ArrowLeftRight,
  'arrow-repeat': Repeat2, 'arrow-return-right': CornerUpRight, 'arrow-right': ArrowRight,
  'arrow-up': ArrowUp, 'arrow-up-right': ArrowUpRight, 'arrows-fullscreen': Maximize,
  'aspect-ratio': Ratio, book: Book, bookmark: Bookmark, 'bookmark-check': BookmarkCheck,
  'box-arrow-left': LogIn, 'box-arrow-right': LogOut, 'box-arrow-up-right': ExternalLink,
  camera: Camera, 'card-text': NotebookText, 'caret-down-fill': ChevronDown,
  'caret-up-fill': ChevronUp, 'chat-dots': MessageCircleMore, 'chat-square-text': MessageSquareText,
  'check-circle-fill': CheckCircle, 'check-square-fill': CheckSquare, check2: Check,
  'check2-circle': CheckCircle, 'check2-square': CheckSquare, 'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, 'chevron-up': ChevronUp,
  clipboard: Clipboard, 'clipboard-check': ClipboardCheck, 'clock-history': History,
  'cloud-arrow-up': CloudUpload, 'code-square': CodeSquare, 'columns-gap': Columns3,
  'dash-lg': Minus, 'emoji-smile': Smile, 'exclamation-diamond': BadgeAlert,
  'exclamation-triangle': TriangleAlert, 'file-earmark': File, 'file-earmark-plus': FilePlus2,
  'file-earmark-text': FileText, 'file-text': FileText, 'filetype-pdf': FileType2, fire: Flame,
  flag: Flag, 'folder-check': FolderCheck, 'folder-plus': FolderPlus,
  'folder-symlink': FolderSymlink, folder2: Folder, 'folder2-open': FolderOpen,
  'fullscreen-exit': Minimize, gift: Gift, git: GitBranch, globe2: Globe2, 'grip-vertical': GripVertical,
  'hand-thumbs-down': ThumbsDown, 'hand-thumbs-up': ThumbsUp, 'hand-thumbs-up-fill': ThumbsUp,
  'hdd-network': HardDrive, heart: Heart, 'heart-fill': Heart, image: Image, inbox: Inbox,
  'journal-text': NotebookText, kanban: Kanban, 'layout-sidebar': PanelLeft,
  'layout-sidebar-inset': PanelLeftOpen, 'layout-sidebar-inset-reverse': PanelLeftClose,
  'layout-text-sidebar-reverse': LayoutPanelLeft, 'lightning-charge': BadgeHelp, 'link-45deg': Link,
  lock: Lock, markdown: FileCode2, megaphone: Megaphone, 'patch-question': CircleHelp, pause: Pause,
  'pencil-square': Pencil, people: Users, person: User, 'person-badge': UserCheck,
  'person-lines-fill': UserCheck, 'person-lock': UserLock, 'person-plus': UserPlus,
  'plus-circle': PlusCircle, 'plus-lg': Plus, reply: Reply, search: Search, 'send-fill': Send,
  share: Share, 'shield-exclamation': ShieldAlert, 'shield-lock': ShieldLock, sliders: Sliders,
  'sort-numeric-down': SortDesc, 'sort-numeric-up-alt': SortAsc, square: Square, star: Star,
  stars: Stars, tags: Tags, 'three-dots': Menu, trash: Trash, trash3: Trash, upload: Upload,
  x: X, 'x-lg': X, 'x-square': XSquare,
  at: AtSign, award: Award, bell: Bell, circle: Circle, 'chat-left-text': MessageSquareText,
  'emoji-frown': Frown, 'patch-check': BadgeCheck, 'question-circle': CircleHelp,
  'question-square': BadgeHelp, repeat: Repeat2, send: Send,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

function hoverIntent(name: IconName) {
  if (name.includes('refresh') || name.includes('clockwise') || name === 'arrow-repeat' || name === 'repeat') return { rotate: 150 };
  if (name.includes('chevron') || name.startsWith('arrow-')) return { x: name.includes('left') ? -2 : name.includes('right') ? 2 : 0, y: name.includes('up') ? -2 : 0 };
  if (name === 'bell' || name === 'inbox') return { rotate: [0, -7, 7, 0] };
  if (name.includes('heart') || name.includes('thumb') || name === 'star') return { scale: 1.12 };
  return { y: -1 };
}

export function Icon({ name, className, ...props }: Omit<LucideProps, 'name'> & { name: IconName }) {
  const Component = icons[name];
  return <motion.span aria-hidden="true" className="rin-icon-motion" whileHover={hoverIntent(name)} transition={{ type: 'spring', stiffness: 520, damping: 28 }}><Component aria-hidden="true" focusable="false" strokeWidth={1.8} {...props} className={`rin-icon rin-icon--${name}${className ? ` ${className}` : ''}`} /></motion.span>;
}
