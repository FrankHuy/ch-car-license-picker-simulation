export type PlateType = "blue" | "new-energy";

export type CandidateSource = "required-list" | "required-regex" | "random";

export interface PlateSegment {
  id: string;
  province: string;
  authority: string;
  start: string;
  end: string;
  enabled: boolean;
}

export interface PickerConfig {
  plateType: PlateType;
  segments: PlateSegment[];
  requiredNumbers: string[];
  requiredPatterns: string[];
  countdownSeconds: number;
}

export interface PlateCandidate {
  plate: string;
  source: CandidateSource;
  matchedRule?: string;
  selectable: boolean;
}

export interface PickSession {
  candidates: PlateCandidate[];
  startedAt: number;
  countdownSeconds: number;
  selectedPlate?: string;
  confirmedPlate?: string;
  status: "picking" | "confirmed" | "expired";
  warnings: string[];
}

export interface GenerateResult {
  candidates: PlateCandidate[];
  warnings: string[];
}
