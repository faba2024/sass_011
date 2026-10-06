import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage() {
  // quem já está logado vai para o painel (ou onboarding, se ainda não tem hamburgueria)
  if (await getUser().catch(() => null)) redirect("/app");
  return <SignUpForm />;
}
