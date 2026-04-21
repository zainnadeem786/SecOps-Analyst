"use client";

import { useEffect, useState } from "react";

import { getActiveGuestCaseId, getGuestUsageCount } from "@/lib/guest";

type GuestShellState = {
  isReady: boolean;
  usageCount: number;
  activeCaseId: string | null;
};

const initialState: GuestShellState = {
  isReady: false,
  usageCount: 0,
  activeCaseId: null,
};

export function useGuestShellState() {
  const [state, setState] = useState<GuestShellState>(initialState);

  useEffect(() => {
    setState({
      isReady: true,
      usageCount: getGuestUsageCount(),
      activeCaseId: getActiveGuestCaseId(),
    });
  }, []);

  return state;
}
