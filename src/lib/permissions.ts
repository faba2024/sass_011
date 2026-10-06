import type { IconName } from "@/components/ui/icons";

export type Permission =
  | "dashboard.view" | "orders.view" | "orders.manage" | "orders.create" | "kitchen.view"
  | "menu.view" | "menu.manage" | "customers.view" | "customers.manage" | "loyalty.manage"
  | "coupons.manage" | "inventory.view" | "inventory.manage" | "delivery.manage" | "deliveries.own"
  | "tables.manage" | "cash.operate" | "finance.view" | "finance.manage" | "reports.view"
  | "marketing.manage" | "reviews.manage" | "staff.manage" | "settings.manage" | "billing.view";

/** Recursos liberados por plano (plans.features) */
export type Feature =
  | "cardapio_online" | "pedidos" | "cozinha" | "delivery" | "clientes" | "cupons"
  | "estoque" | "caixa" | "financeiro" | "fidelidade" | "mesas" | "relatorios" | "marketing" | "dominio_proprio";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  perm: Permission;
  feature?: Feature;
  shortcut?: string;
  keywords?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Operação",
    items: [
      { href: "/app", label: "Visão geral", icon: "gauge", perm: "dashboard.view", shortcut: "G D", keywords: "dashboard inicio" },
      { href: "/app/pedidos", label: "Pedidos", icon: "ticket", perm: "orders.view", feature: "pedidos", shortcut: "P" },
      { href: "/app/cozinha", label: "Cozinha", icon: "flame", perm: "kitchen.view", feature: "cozinha", shortcut: "K", keywords: "kds chapa" },
      { href: "/app/caixa", label: "Caixa / PDV", icon: "register", perm: "cash.operate", feature: "caixa", shortcut: "X", keywords: "balcao venda pdv" },
      { href: "/app/mesas", label: "Mesas", icon: "table", perm: "tables.manage", feature: "mesas", keywords: "qr code" },
      { href: "/app/entregador", label: "Minhas entregas", icon: "bike", perm: "deliveries.own", feature: "delivery" },
    ],
  },
  {
    label: "Cardápio",
    items: [
      { href: "/app/cardapio", label: "Cardápio", icon: "menu-book", perm: "menu.view", shortcut: "M" },
      { href: "/app/produtos", label: "Produtos", icon: "burger", perm: "menu.view" },
      { href: "/app/categorias", label: "Categorias", icon: "folders", perm: "menu.view" },
      { href: "/app/combos", label: "Combos", icon: "combo", perm: "menu.view" },
      { href: "/app/adicionais", label: "Adicionais e variações", icon: "plus-circle", perm: "menu.view", keywords: "modificadores opcoes" },
    ],
  },
  {
    label: "Clientes",
    items: [
      { href: "/app/clientes", label: "Clientes", icon: "users", perm: "customers.view", feature: "clientes", shortcut: "C", keywords: "crm" },
      { href: "/app/fidelidade", label: "Fidelidade", icon: "star", perm: "loyalty.manage", feature: "fidelidade", keywords: "pontos" },
      { href: "/app/cupons", label: "Cupons", icon: "tag", perm: "coupons.manage", feature: "cupons" },
      { href: "/app/avaliacoes", label: "Avaliações", icon: "chat-star", perm: "reviews.manage" },
      { href: "/app/marketing", label: "Marketing", icon: "megaphone", perm: "marketing.manage", feature: "marketing", keywords: "campanhas" },
      { href: "/app/whatsapp", label: "WhatsApp", icon: "whatsapp", perm: "marketing.manage", keywords: "mensagens templates" },
    ],
  },
  {
    label: "Logística",
    items: [
      { href: "/app/delivery", label: "Áreas de entrega", icon: "map-pin", perm: "delivery.manage", feature: "delivery", keywords: "taxa bairro zonas" },
      { href: "/app/entregadores", label: "Entregadores", icon: "bike", perm: "delivery.manage", feature: "delivery", keywords: "motoboy" },
      { href: "/app/estoque", label: "Estoque", icon: "boxes", perm: "inventory.view", feature: "estoque", shortcut: "E", keywords: "insumos ingredientes ficha tecnica" },
      { href: "/app/fornecedores", label: "Fornecedores", icon: "truck", perm: "inventory.view", feature: "estoque" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/app/financeiro", label: "Financeiro", icon: "wallet", perm: "finance.view", feature: "financeiro", shortcut: "F" },
      { href: "/app/despesas", label: "Despesas", icon: "receipt", perm: "finance.view", feature: "financeiro", keywords: "contas pagar" },
      { href: "/app/relatorios", label: "Relatórios", icon: "chart", perm: "reports.view", feature: "relatorios", shortcut: "R" },
      { href: "/app/funcionarios", label: "Funcionários", icon: "badge", perm: "staff.manage", keywords: "equipe permissoes" },
      { href: "/app/configuracoes", label: "Configurações", icon: "settings", perm: "settings.manage", keywords: "loja horarios pix cores" },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items);

/** Primeira rota que o usuário pode abrir (cozinha → /app/cozinha, entregador → /app/entregador) */
export function homeFor(perms: Set<string>, features: string[]): string {
  const order = ["/app", "/app/pedidos", "/app/cozinha", "/app/caixa", "/app/entregador", "/app/cardapio", "/app/estoque"];
  for (const href of order) {
    const item = ALL_NAV_ITEMS.find((i) => i.href === href);
    if (item && perms.has(item.perm) && (!item.feature || features.includes(item.feature))) return href;
  }
  const any = ALL_NAV_ITEMS.find((i) => perms.has(i.perm));
  return any?.href ?? "/app/sem-acesso";
}

export const FEATURE_PLAN: Record<Feature, string> = {
  cardapio_online: "Starter", pedidos: "Starter", cozinha: "Starter", delivery: "Starter", clientes: "Starter", cupons: "Starter",
  estoque: "Pro", caixa: "Pro", financeiro: "Pro", fidelidade: "Pro", mesas: "Pro", relatorios: "Pro",
  marketing: "Premium", dominio_proprio: "Premium",
};

export const FEATURE_LABELS: Record<Feature, string> = {
  cardapio_online: "Cardápio online", pedidos: "Pedidos", cozinha: "Cozinha (KDS)", delivery: "Delivery", clientes: "Clientes (CRM)", cupons: "Cupons",
  estoque: "Estoque e ficha técnica", caixa: "Caixa / PDV", financeiro: "Financeiro", fidelidade: "Programa de fidelidade",
  mesas: "Mesas e QR Code", relatorios: "Relatórios", marketing: "Marketing", dominio_proprio: "Domínio próprio",
};
