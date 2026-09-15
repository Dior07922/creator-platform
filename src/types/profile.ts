// name=src/types/profile.ts

export type PersonalProfile = {
  name: string;
  bio: string;
  gender: string;
  birthday: string;
  wish: string;
};

export const DEFAULT_PERSONAL_PROFILE: PersonalProfile = {
  name: "好技友",
  bio: "",
  gender: "",
  birthday: "",
  wish: "",
};