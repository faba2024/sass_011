// Tipos de domínio do TOP BURGER OS (espelham o schema em supabase/migrations)

export type OrderStatus =
  | "new"
  | "awaiting_confirmation"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";
export type OrderType = "delivery" | "pickup" | "dine_in" | "counter";
export type OrderSource = "online" | "table" | "pdv" | "admin";
export type PaymentMethod = "pix" | "cash" | "card" | "card_online";
export type PaymentStatus = "pending" | "paid" | "refunded";
export type ModifierKind = "variation" | "addon" | "removal";
export type DriverStatus = "available" | "on_delivery" | "offline";
export type TableStatus = "free" | "occupied" | "awaiting_payment";
export type CouponType = "percent" | "fixed" | "free_delivery" | "free_product";
export type SubscriptionStatus = "trialing" | "active" | "pending" | "past_due" | "cancelled";
export type StoreMode = "auto" | "open" | "closed";
export type RoleKey = "owner" | "manager" | "attendant" | "cashier" | "kitchen" | "driver" | string;

export interface Organization {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  description: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_district: string | null;
  address_complement: string | null;
  address_city: string | null;
  address_state: string | null;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string;
  secondary_color: string;
  custom_domain: string | null;
  status: "active" | "suspended" | "cancelled";
  timezone: string;
  store_mode: StoreMode;
  closed_message: string;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  accepts_dine_in: boolean;
  allow_scheduling: boolean;
  auto_confirm_table_orders: boolean;
  min_order_value: number;
  pickup_eta_min: number;
  pickup_eta_max: number;
  accepts_pix: boolean;
  accepts_cash: boolean;
  accepts_card: boolean;
  pix_key: string | null;
  pix_key_type: string | null;
  pix_holder_name: string | null;
  pix_city: string | null;
  vip_min_orders: number;
  vip_min_spent: number;
  inactive_days: number;
  onboarding_step: number;
  onboarding_completed_at: string | null;
  created_at: string;
}

export interface StoreStatus {
  is_open: boolean;
  mode: StoreMode;
  message: string | null;
  next_open_at: string | null;
  closes_at: string | null;
}

// ---------- Cardápio público (get_storefront) ----------
export interface SfOption {
  id: string;
  name: string;
  price_delta: number;
  max_quantity: number;
  is_default: boolean;
}
export interface SfGroup {
  id: string;
  name: string;
  description: string | null;
  kind: ModifierKind;
  min_select: number;
  max_select: number;
  is_required: boolean;
  options: SfOption[];
}
export interface SfComboOption {
  product_id: string;
  name: string;
  price_delta: number;
  is_available: boolean;
  image: string | null;
}
export interface SfComboGroup {
  id: string;
  name: string;
  min_qty: number;
  max_qty: number;
  options: SfComboOption[];
}
export interface SfProduct {
  id: string;
  category_id: string | null;
  type: "simple" | "combo";
  name: string;
  description: string | null;
  ingredients: string | null;
  price: number;
  promo_price: number | null;
  prep_minutes: number | null;
  is_available: boolean;
  is_featured: boolean;
  sort: number;
  images: string[];
  groups: SfGroup[];
  combo_groups: SfComboGroup[];
}
export interface SfZone {
  id: string;
  name: string;
  fee: number;
  min_order: number;
  eta_min: number;
  eta_max: number;
  zip_prefixes: string[];
}
export interface Storefront {
  org: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo_url: string | null;
    banner_url: string | null;
    primary_color: string;
    secondary_color: string;
    phone: string | null;
    whatsapp: string | null;
    instagram: string | null;
    address: {
      street: string | null;
      number: string | null;
      district: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      complement: string | null;
    };
    accepts_delivery: boolean;
    accepts_pickup: boolean;
    accepts_dine_in: boolean;
    accepts_pix: boolean;
    accepts_cash: boolean;
    accepts_card: boolean;
    allow_scheduling: boolean;
    min_order_value: number;
    pickup_eta_min: number;
    pickup_eta_max: number;
    timezone: string;
  };
  status: StoreStatus;
  hours: { weekday: number; opens_at: string; closes_at: string }[];
  exceptions: { date: string; is_closed: boolean; opens_at: string | null; closes_at: string | null; reason: string | null }[];
  rating: { avg: number; count: number } | null;
  categories: { id: string; name: string; description: string | null }[];
  products: SfProduct[];
  zones: SfZone[];
  loyalty: { points_per_real: number } | null;
}

// ---------- Cotação (quote_order) ----------
export interface QuoteOption {
  kind: "modifier" | "combo_choice";
  group_name: string;
  group_kind?: ModifierKind | null;
  name: string;
  unit_price: number;
  quantity: number;
}
export interface QuoteItem {
  product_id: string;
  product_name: string;
  base_price: number;
  unit_price: number;
  quantity: number;
  total: number;
  notes: string | null;
  options: QuoteOption[];
  key: string | null;
}
export interface Quote {
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  coupon: { id: string; code: string; type: CouponType; description: string | null; discount: number } | null;
  coupon_error: string | null;
  zone: { id: string; name: string; fee: number; eta_min: number; eta_max: number } | null;
  min_order: number;
  below_minimum: boolean;
  eta_min: number | null;
  eta_max: number | null;
  store: StoreStatus;
}

// ---------- Pedido público (get_public_order) ----------
export interface PublicOrder {
  id: string;
  number: number;
  token: string;
  type: OrderType;
  status: OrderStatus;
  created_at: string;
  scheduled_for: string | null;
  eta_min: number | null;
  eta_max: number | null;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  customer_name: string | null;
  address: Address | null;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  coupon_code: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  change_for: number | null;
  notes: string | null;
  loyalty_points_earned: number;
  table_label: string | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
    notes: string | null;
    options: { group: string; kind: string; group_kind: ModifierKind | null; name: string; quantity: number; unit_price: number }[];
  }[];
  history: { status: OrderStatus; at: string }[];
  review: { rating: number; comment: string | null; reply: string | null } | null;
  org: {
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    whatsapp: string | null;
    phone: string | null;
    address: string | null;
    pix_key: string | null;
    pix_key_type: string | null;
    pix_holder_name: string | null;
    pix_city: string | null;
    timezone: string;
  };
}

export interface Address {
  zip?: string | null;
  street: string;
  number: string;
  district: string;
  complement?: string | null;
  reference?: string | null;
  city?: string | null;
}

// ---------- Admin ----------
export interface OrderRow {
  id: string;
  organization_id: string;
  number: number;
  public_token: string;
  type: OrderType;
  status: OrderStatus;
  source: OrderSource;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: Address | null;
  delivery_zone_id: string | null;
  table_id: string | null;
  table_session_id: string | null;
  driver_id: string | null;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  coupon_code: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  paid_at: string | null;
  change_for: number | null;
  notes: string | null;
  scheduled_for: string | null;
  eta_min: number | null;
  eta_max: number | null;
  loyalty_points_earned: number;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  base_price: number;
  quantity: number;
  total: number;
  notes: string | null;
  sort: number;
  order_item_modifiers: {
    id: string;
    kind: "modifier" | "combo_choice";
    group_name: string;
    group_kind: ModifierKind | null;
    name: string;
    unit_price: number;
    quantity: number;
    sort: number;
  }[];
}

export type OrderWithItems = OrderRow & { order_items: OrderItemRow[] };

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}
