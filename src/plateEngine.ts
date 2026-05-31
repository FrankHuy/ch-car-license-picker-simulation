import type {
  CandidateSource,
  GenerateResult,
  PickerConfig,
  PlateCandidate,
  PlateSegment,
  PlateType,
} from "./types";

const SEQUENCE_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const VALID_SEQUENCE = /^[0-9A-HJ-NP-Z]+$/;
const FULL_PLATE = /^([\u4e00-\u9fa5])([A-Z])([0-9A-HJ-NP-Z]+)$/;
const TARGET_COUNT = 50;
const REGEX_SAMPLE_LIMIT = 3000;

const PLATE_RULES: Record<PlateType, { sequenceLength: number; label: string }> = {
  blue: { sequenceLength: 5, label: "小型汽车蓝牌" },
  "new-energy": { sequenceLength: 6, label: "新能源号牌" },
};

interface ParsedPlate {
  province: string;
  authority: string;
  sequence: string;
}

interface NormalizedSegment extends PlateSegment {
  startIndex: number;
  endIndex: number;
  sequenceLength: number;
}

export function createDefaultConfig(): PickerConfig {
  return {
    plateType: "blue",
    segments: [
      {
        id: crypto.randomUUID(),
        province: "京",
        authority: "A",
        start: "00000",
        end: "99999",
        enabled: true,
      },
    ],
    requiredNumbers: ["京A88888"],
    requiredPatterns: ["^京A.*(666|888)$"],
    countdownSeconds: 90,
    ownerName: "王天伦",
    vehicleBrand: "比亚迪牌BYD7005BEVA8",
  };
}

export function getSequenceLength(plateType: PlateType): number {
  return PLATE_RULES[plateType].sequenceLength;
}

export function normalizePlate(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[·.\-\s]/g, "");
}

export function formatPlate(plate: string): string {
  const normalized = normalizePlate(plate);
  if (normalized.length <= 2) {
    return normalized;
  }
  return `${normalized.slice(0, 2)}·${normalized.slice(2)}`;
}

export function validateFullPlate(plate: string, plateType: PlateType): string | null {
  const parsed = parsePlate(plate);
  if (!parsed) {
    return "号牌格式不合法";
  }
  const expectedLength = getSequenceLength(plateType);
  if (parsed.sequence.length !== expectedLength) {
    return `${PLATE_RULES[plateType].label}需要${expectedLength}位序列`;
  }
  return null;
}

export function generateCandidates(config: PickerConfig): GenerateResult {
  const warnings: string[] = [];
  const normalizedSegments = normalizeSegments(config, warnings);
  const candidates: PlateCandidate[] = [];
  const seen = new Set<string>();

  if (normalizedSegments.length === 0) {
    return {
      candidates: [],
      warnings: ["没有可用号段，请至少启用一个合法号段。"],
    };
  }

  for (const rawPlate of config.requiredNumbers) {
    if (candidates.length >= TARGET_COUNT) {
      break;
    }

    const plate = normalizePlate(rawPlate);
    if (!plate) {
      continue;
    }

    const error = validateFullPlate(plate, config.plateType);
    if (error) {
      warnings.push(`必出号码 ${rawPlate} 已忽略：${error}`);
      continue;
    }

    if (!isPlateInSegments(plate, normalizedSegments)) {
      warnings.push(`必出号码 ${formatPlate(plate)} 不在已启用号段内，已忽略。`);
      continue;
    }

    addCandidate(candidates, seen, plate, "required-list", rawPlate);
  }

  for (const pattern of config.requiredPatterns) {
    if (candidates.length >= TARGET_COUNT || !pattern.trim()) {
      continue;
    }

    const regex = createRegex(pattern, warnings);
    if (!regex) {
      continue;
    }

    let attempts = 0;
    while (candidates.length < TARGET_COUNT && attempts < REGEX_SAMPLE_LIMIT) {
      attempts += 1;
      const plate = randomPlateFromSegments(normalizedSegments);
      regex.lastIndex = 0;
      if (regex.test(plate)) {
        addCandidate(candidates, seen, plate, "required-regex", pattern);
      }
    }

    if (!candidates.some((candidate) => candidate.matchedRule === pattern)) {
      warnings.push(`正则 ${pattern} 在采样中未命中可用号牌。`);
    }
  }

  let randomAttempts = 0;
  const maxRandomAttempts = TARGET_COUNT * 400;
  while (candidates.length < TARGET_COUNT && randomAttempts < maxRandomAttempts) {
    randomAttempts += 1;
    addCandidate(candidates, seen, randomPlateFromSegments(normalizedSegments), "random");
  }

  if (candidates.length < TARGET_COUNT) {
    warnings.push(`可用号池不足或去重后不足50个，本轮仅生成${candidates.length}个候选号牌。`);
  }

  return { candidates: shuffle(candidates), warnings };
}

function addCandidate(
  candidates: PlateCandidate[],
  seen: Set<string>,
  plate: string,
  source: CandidateSource,
  matchedRule?: string,
) {
  if (seen.has(plate)) {
    return;
  }
  seen.add(plate);
  candidates.push({
    plate,
    source,
    matchedRule,
    selectable: true,
  });
}

function normalizeSegments(config: PickerConfig, warnings: string[]): NormalizedSegment[] {
  const sequenceLength = getSequenceLength(config.plateType);
  return config.segments
    .filter((segment) => segment.enabled)
    .map((segment) => normalizeSegment(segment, sequenceLength, warnings))
    .filter((segment): segment is NormalizedSegment => Boolean(segment));
}

function normalizeSegment(
  segment: PlateSegment,
  sequenceLength: number,
  warnings: string[],
): NormalizedSegment | null {
  const province = segment.province.trim().slice(0, 1);
  const authority = segment.authority.trim().toUpperCase().slice(0, 1);
  const start = segment.start.trim().toUpperCase();
  const end = segment.end.trim().toUpperCase();

  if (!/^[\u4e00-\u9fa5]$/.test(province) || !/^[A-Z]$/.test(authority)) {
    warnings.push("已忽略一个号段：省份简称或发牌机关不合法。");
    return null;
  }

  if (!isValidSequence(start, sequenceLength) || !isValidSequence(end, sequenceLength)) {
    warnings.push(`已忽略 ${province}${authority} 号段：起止序列必须为${sequenceLength}位。`);
    return null;
  }

  const startIndex = sequenceToIndex(start);
  const endIndex = sequenceToIndex(end);
  if (startIndex > endIndex) {
    warnings.push(`已忽略 ${province}${authority} 号段：起始序列不能大于结束序列。`);
    return null;
  }

  return {
    ...segment,
    province,
    authority,
    start,
    end,
    startIndex,
    endIndex,
    sequenceLength,
  };
}

function isValidSequence(sequence: string, expectedLength: number): boolean {
  return sequence.length === expectedLength && VALID_SEQUENCE.test(sequence);
}

function parsePlate(input: string): ParsedPlate | null {
  const plate = normalizePlate(input);
  const match = FULL_PLATE.exec(plate);
  if (!match) {
    return null;
  }
  return {
    province: match[1],
    authority: match[2],
    sequence: match[3],
  };
}

function isPlateInSegments(plate: string, segments: NormalizedSegment[]): boolean {
  const parsed = parsePlate(plate);
  if (!parsed) {
    return false;
  }
  const index = sequenceToIndex(parsed.sequence);
  return segments.some(
    (segment) =>
      segment.province === parsed.province &&
      segment.authority === parsed.authority &&
      segment.sequenceLength === parsed.sequence.length &&
      index >= segment.startIndex &&
      index <= segment.endIndex,
  );
}

function randomPlateFromSegments(segments: NormalizedSegment[]): string {
  const segment = segments[Math.floor(Math.random() * segments.length)];
  const sequenceIndex = randomInteger(segment.startIndex, segment.endIndex);
  return `${segment.province}${segment.authority}${indexToSequence(sequenceIndex, segment.sequenceLength)}`;
}

function randomInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sequenceToIndex(sequence: string): number {
  return sequence.split("").reduce((value, char) => {
    const digit = SEQUENCE_ALPHABET.indexOf(char);
    if (digit < 0) {
      throw new Error(`Invalid sequence character: ${char}`);
    }
    return value * SEQUENCE_ALPHABET.length + digit;
  }, 0);
}

function indexToSequence(index: number, length: number): string {
  const chars: string[] = [];
  let value = index;
  for (let position = 0; position < length; position += 1) {
    chars.unshift(SEQUENCE_ALPHABET[value % SEQUENCE_ALPHABET.length]);
    value = Math.floor(value / SEQUENCE_ALPHABET.length);
  }
  return chars.join("").padStart(length, "0");
}

function createRegex(pattern: string, warnings: string[]): RegExp | null {
  try {
    return new RegExp(pattern.trim(), "i");
  } catch {
    warnings.push(`正则 ${pattern} 不合法，已忽略。`);
    return null;
  }
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
