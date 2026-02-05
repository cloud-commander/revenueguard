export type ClassId =
  | "mon-0900"
  | "tue-1200"
  | "wed-1800"
  | "thu-0600"
  | "fri-1500";

export const VALID_CLASSES: ClassId[] = [
  "mon-0900",
  "tue-1200",
  "wed-1800",
  "thu-0600",
  "fri-1500",
];

export type GymClass = {
  id: ClassId;
  name: string;
  time: string;
  capacity: number;
  seatsBooked: number;
  seatsRemaining: number;
  isBooked?: boolean;
};

export type BookingMode = "safe" | "unsafe";

export type BookingResponse = {
  success: boolean;
  message: string;
  seatsRemaining?: number;
  totalBooked?: number;
  error?:
    | "FULL"
    | "INVALID_CLASS"
    | "INVALID_USER"
    | "STORAGE_FAILURE"
    | "INTERNAL_ERROR"
    | "ALREADY_BOOKED";
};
