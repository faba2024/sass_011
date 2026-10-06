import type { OrderStatus, OrderType, PaymentMethod, ModifierKind, CouponType, DriverStatus, TableStatus, SubscriptionStatus } from "./types";

export const ORDER_STATUS: Record<OrderStatus, { label: string; short: string; tone: Tone; customer: string }> = {
  new: { label: "Novo", short: "Novo", tone: "ember", customer: "Pedido recebido" },
  awaiting_confirmation: { label: "Aguardando confirmação", short: "Aguardando", tone: "mustard", customer: "Aguardando confirmação da loja" },
  confirmed: { label: "Confirmado", short: "Confirmado", tone: "blue", customer: "Pedido confirmado" },
  preparing: { label: "Em preparo", short: "Preparando", tone: "mustard", customer: "Seu pedido está sendo preparado" },
  ready: { label: "Pronto", short: "Pronto", tone: "green", customer: "Seu pedido está pronto" },
  out_for_delivery: { label: "Saiu para entrega", short: "Em rota", tone: "violet", customer: "Seu pedido saiu para entrega" },
  delivered: { label: "Entregue", short: "Concluído", tone: "neutral", customer: "Pedido entregue" },
  cancelled: { label: "Cancelado", short: "Cancelado", tone: "red", customer: "Pedido cancelado" },
};

export type Tone = "neutral" | "ember" | "mustard" | "green" | "red" | "blue" | "violet";

export const ORDER_TYPE: Record<OrderType, { label: string; short: string }> = {
  delivery: { label: "Entrega", short: "Entrega" },
  pickup: { label: "Retirada", short: "Retirada" },
  dine_in: { label: "Consumo no local", short: "No local" },
  counter: { label: "Balcão", short: "Balcão" },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartão",
  card_online: "Cartão online",
};

export const MODIFIER_KIND: Record<ModifierKind, { label: string; hint: string }> = {
  variation: { label: "Variação", hint: "Tamanho, carnes, pão, ponto, queijo, molho" },
  addon: { label: "Adicionais", hint: "Itens extras com acréscimo" },
  removal: { label: "Retirar ingredientes", hint: "O cliente marca o que NÃO quer" },
};

export const COUPON_TYPE: Record<CouponType, string> = {
  percent: "Percentual",
  fixed: "Valor fixo",
  free_delivery: "Frete grátis",
  free_product: "Produto grátis",
};

export const DRIVER_STATUS: Record<DriverStatus, { label: string; tone: Tone }> = {
  available: { label: "Disponível", tone: "green" },
  on_delivery: { label: "Em entrega", tone: "violet" },
  offline: { label: "Offline", tone: "neutral" },
};

export const TABLE_STATUS: Record<TableStatus, { label: string; tone: Tone }> = {
  free: { label: "Livre", tone: "green" },
  occupied: { label: "Ocupada", tone: "ember" },
  awaiting_payment: { label: "Aguardando pagamento", tone: "mustard" },
};

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, { label: string; tone: Tone }> = {
  trialing: { label: "Trial", tone: "blue" },
  active: { label: "Ativa", tone: "green" },
  pending: { label: "Pendente", tone: "mustard" },
  past_due: { label: "Atrasada", tone: "red" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export const EXPENSE_CATEGORIES: Record<string, string> = {
  aluguel: "Aluguel",
  energia: "Energia",
  agua: "Água",
  funcionarios: "Funcionários",
  fornecedores: "Fornecedores",
  marketing: "Marketing",
  impostos: "Impostos",
  manutencao: "Manutenção",
  outras: "Outras",
};

export const UNITS: Record<string, string> = {
  un: "unidade",
  g: "grama",
  kg: "quilo",
  ml: "mililitro",
  l: "litro",
  fatia: "fatia",
  porcao: "porção",
};

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const SEGMENTS: Record<string, { label: string; tone: Tone; hint: string }> = {
  new: { label: "Novo", tone: "blue", hint: "Até 1 pedido" },
  recurring: { label: "Recorrente", tone: "green", hint: "2 ou mais pedidos" },
  vip: { label: "VIP", tone: "mustard", hint: "Muitos pedidos ou alto gasto" },
  inactive: { label: "Inativo", tone: "neutral", hint: "Sem pedir há muito tempo" },
};

/** Colunas do Kanban de pedidos */
export const KANBAN: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "new", label: "Novos", statuses: ["new", "awaiting_confirmation"] },
  { key: "confirmed", label: "Confirmados", statuses: ["confirmed"] },
  { key: "preparing", label: "Preparando", statuses: ["preparing"] },
  { key: "ready", label: "Prontos", statuses: ["ready"] },
  { key: "delivery", label: "Entrega", statuses: ["out_for_delivery"] },
];

/** Próximo passo natural de um pedido (botão "Avançar") */
export function nextStatus(status: OrderStatus, type: OrderType): OrderStatus | null {
  switch (status) {
    case "new":
    case "awaiting_confirmation":
      return "confirmed";
    case "confirmed":
      return "preparing";
    case "preparing":
      return "ready";
    case "ready":
      return type === "delivery" ? "out_for_delivery" : "delivered";
    case "out_for_delivery":
      return "delivered";
    default:
      return null;
  }
}

export const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: "Confirmar",
  preparing: "Iniciar preparo",
  ready: "Marcar pronto",
  out_for_delivery: "Saiu para entrega",
  delivered: "Concluir",
};
