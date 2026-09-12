export interface HealthTile {
  readonly label: string;
  /** Null renders as "unavailable". */
  readonly value: string | null;
  readonly hint: string;
}
