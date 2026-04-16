"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearGuestUsage } from "@/lib/guest";
import { ApiError } from "@/lib/http";
import { loginUser, registerUser } from "@/lib/platform-api";

interface AuthFormCardProps {
  mode: "login" | "register";
}

export function AuthFormCard({ mode }: AuthFormCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        await loginUser(email, password);
      } else {
        await registerUser(email, password);
      }
      clearGuestUsage();
      await refreshSession();
      toast.success(mode === "login" ? "Logged in successfully" : "Account created successfully");
      router.push(searchParams.get("next") || "/");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 401
          ? "Authentication failed"
          : mode === "login"
            ? "Login failed"
            : "Registration failed",
        {
          description: error instanceof Error ? error.message : "Unexpected backend response.",
        },
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="glass-panel mx-auto w-full max-w-xl rounded-3xl border-white/10 bg-slate-950/55">
      <CardHeader>
        <CardTitle>{mode === "login" ? "Sign in" : "Create account"}</CardTitle>
        <CardDescription className="mt-2 leading-6 text-slate-300">
          {mode === "login"
            ? "Access your persistent investigations, sharing tools, executive reporting, and saved cases."
            : "Create a secure SOC workspace and claim your current guest investigation history automatically."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-100" htmlFor={`${mode}-email`}>
              Email
            </label>
            <Input
              id={`${mode}-email`}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="analyst@example.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-100" htmlFor={`${mode}-password`}>
              Password
            </label>
            <Input
              id={`${mode}-password`}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </div>
          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (mode === "login" ? "Signing in..." : "Creating account...") : mode === "login" ? "Login" : "Register"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
