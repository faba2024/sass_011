"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { zId } from "@/lib/zod-helpers";

const addSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  phone: z.string().optional().nullable(),
  role: z.string().min(2),
  password: z.string().optional().nullable(),
});

/** Cadastra funcionário: cria o login no Supabase Auth (se ainda não existir) e vincula à empresa */
export async function addStaffAction(input: z.input<typeof addSchema>) {
  return run(async () => {
    const ctx = await requireAction("staff.manage");
    const d = addSchema.parse(input);
    const admin = createAdminClient();
    const { data: existing } = await admin.from("profiles").select("id").eq("email", d.email).maybeSingle();
    let userId = existing?.id as string | undefined;
    let created = false;
    if (!userId) {
      if (!d.password || d.password.length < 8) fail("Defina uma senha inicial com pelo menos 8 caracteres");
      const { data, error } = await admin.auth.admin.createUser({ email: d.email, password: d.password, email_confirm: true, user_metadata: { full_name: d.name } });
      if (error || !data.user) fail(error?.message?.includes("registered") ? "Este e-mail já tem conta." : error?.message ?? "Não foi possível criar o acesso");
      userId = data.user.id;
      created = true;
    }
    const supabase = await createClient();
    const { error } = await supabase.rpc("add_member", { p_org: ctx.org.id, p_user: userId, p_role_key: d.role, p_display_name: d.name, p_phone: d.phone ?? null });
    if (error) {
      if (created) await admin.auth.admin.deleteUser(userId);
      throw error;
    }
    revalidatePath("/app/funcionarios");
    return { created };
  });
}

export async function updateStaffAction(memberId: string, patch: { role?: string; active?: boolean; name?: string; phone?: string }) {
  return run(async () => {
    await requireAction("staff.manage");
    const supabase = await createClient();
    const { error } = await supabase.rpc("update_member", { p_member: zId.parse(memberId), p_role_key: patch.role ?? null, p_active: patch.active ?? null, p_display_name: patch.name ?? null, p_phone: patch.phone ?? null });
    if (error) throw error;
    revalidatePath("/app/funcionarios");
    return true;
  });
}

export async function resetStaffPasswordAction(memberId: string, password: string) {
  return run(async () => {
    const ctx = await requireAction("staff.manage");
    if (password.length < 8) fail("A senha precisa de pelo menos 8 caracteres");
    const supabase = await createClient();
    const m = must(await supabase.from("organization_members").select("user_id, role:roles(key)").eq("id", zId.parse(memberId)).eq("organization_id", ctx.org.id).single()) as unknown as { user_id: string; role: { key: string } | null };
    if (m.role?.key === "owner" && ctx.roleKey !== "owner" && !ctx.isPlatformAdmin) fail("Apenas o dono pode trocar a senha de outro dono");
    if (m.user_id === ctx.userId) fail("Para trocar a sua senha use “Esqueci a senha” no login");
    const { error } = await createAdminClient().auth.admin.updateUserById(m.user_id, { password });
    if (error) fail(error.message);
    return true;
  });
}

export async function setRolePermissionsAction(roleId: string, perms: string[]) {
  return run(async () => {
    await requireAction("staff.manage");
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_role_permissions", { p_role: zId.parse(roleId), p_permissions: z.array(z.string()).parse(perms) });
    if (error) throw error;
    revalidatePath("/app/funcionarios");
    return true;
  });
}
