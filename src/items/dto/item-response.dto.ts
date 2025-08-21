export interface ItemResponseDto {
  id: number;
  name: string;
  iconUrl: string;
  examine: string | null;
  value: number | null;
  highAlch: number | null;
  lowAlch: number | null;
  buyLimit: number | null;
  questItem: boolean | null;
  equipable: boolean | null;
  noteable: boolean | null;
  stackable: boolean | null;
  weight: number | null;
  tradeable: boolean | null;
  members: boolean | null;
  lastSyncedAt: string;
  highPrice?: number | null;
  lowPrice?: number | null;
  highTime?: number | null;
  lowTime?: number | null;
}

export interface ItemCompactDto {
  id: number;
  name: string;
  iconUrl: string;
}
