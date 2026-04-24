// components/Icon.jsx
import * as Lu from "lucide-react";

/**
 * Usage: <Icon name="cart" className="h-5 w-5" />
 * Inherits currentColor; works with Tailwind sizing.
 */
const MAP = {
  cart: Lu.ShoppingCart,
  search: Lu.Search,
  plus: Lu.Plus,
  minus: Lu.Minus,
  x: Lu.X,
  trash: Lu.Trash2,
  send: Lu.Send,
  sliders: Lu.SlidersHorizontal,
  info: Lu.Info,
  check: Lu.CheckCircle,
  "edit-3": Lu.Edit3,
  "shopping-cart": Lu.ShoppingCart,
  "trash-2": Lu.Trash2,
  loader: Lu.Loader2,
  eye: Lu.Eye,

  
  // 👇 add these
  globe: Lu.Globe,
  language: Lu.Languages, // optional alt
  "arrow-up": Lu.ArrowUp,
  "arrow-down": Lu.ChevronDown,
  "arrow-left": Lu.ChevronLeft,
  "arrow-right": Lu.ChevronRight,
  check: Lu.Check,
  "map-pin": Lu.MapPin,
  map: Lu.Map,
  help: Lu.HelpCircle,
  "phone-call": Lu.PhoneCall,
  sparkles: Lu.Sparkles,
  receipt: Lu.LucideReceiptText,
  clock: Lu.Clock,
  calendar: Lu.Calendar,
  users: Lu.Users,
  "chevron-up": Lu.ChevronUp,
  "chevron-down": Lu.ChevronDown,
  "chevron-right": Lu.ChevronRight,
  "chevron-left": Lu.ChevronLeft,
  menu: Lu.Menu,
  home: Lu.Home,
  phone: Lu.Phone,
  mail: Lu.Mail,
  edit: Lu.Edit,
  "alert-circle": Lu.AlertCircle,
  user: Lu.User,
  // Food & Beverage
  utensils: Lu.Utensils,
  pizza: Lu.Pizza,
  burger: Lu.CircleDot, // Lucide doesn't have Burger in all versions, using CircleDot as fallback or generic
  coffee: Lu.Coffee,
  beer: Lu.Beer,
  wine: Lu.Wine,
  cake: Lu.Cake,
  soup: Lu.Soup,
  salad: Lu.Salad,
  fish: Lu.Fish,
  icecream: Lu.IceCream,
  flame: Lu.Flame,
  heart: Lu.Heart,
  star: Lu.Star,
};

export default function Icon({
  name,
  className = "h-5 w-5",
  strokeWidth = 2,
  absoluteStrokeWidth = false,
  ...rest
}) {
  const Cmp = MAP[name];
  if (!Cmp) return null;
  return (
    <Cmp
      className={className}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth={absoluteStrokeWidth}
      aria-hidden
      {...rest}
    />
  );
}
