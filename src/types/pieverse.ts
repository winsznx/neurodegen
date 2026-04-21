export interface SkillCommand {
  trigger: string;
  description: string;
  paid: boolean;
  pricePerHour?: string;
}

export interface SkillManifest {
  skillId: string;
  name: string;
  description: string;
  version: string;
  author: string;
  commands: SkillCommand[];
  walletRequirements: {
    chain: string;
    tokenStandard: string;
    paymentToken: string;
  };
}
