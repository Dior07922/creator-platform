// name=src/lib/localProfile.ts

import type { PersonalProfile } from "../types/profile";
import { DEFAULT_PERSONAL_PROFILE } from "../types/profile";

export function loadPersonalProfile(): PersonalProfile {
  if (typeof window === "undefined") return DEFAULT_PERSONAL_PROFILE;
  try {
    return {
      ...DEFAULT_PERSONAL_PROFILE,
      ...JSON.parse(localStorage.getItem("ranjingPersonalProfile") || "{}"),
    };
  } catch {
    return DEFAULT_PERSONAL_PROFILE;
  }
}