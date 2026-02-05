import { VALID_CLASSES } from "../types";
import type { GymClass, ClassId, BookingResponse } from "../types";

// Mock Database State
interface MockState {
  classes: Record<ClassId, { booked: number }>;
}

let state: MockState = {
  classes: VALID_CLASSES.reduce(
    (acc, id) => ({ ...acc, [id]: { booked: 0 } }),
    {} as any,
  ),
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockApi = {
  // Reset state
  reset: async () => {
    await delay(500);
    state = {
      classes: VALID_CLASSES.reduce(
        (acc, id) => ({ ...acc, [id]: { booked: 0 } }),
        {} as any,
      ),
    };
    return { success: true };
  },

  // Get current state
  getState: async (): Promise<GymClass[]> => {
    await delay(100);
    return VALID_CLASSES.map((id) => ({
      id,
      name: `Class ${id.toUpperCase()}`,
      time: id.split("-")[1] || "00:00",
      capacity: 20,
      seatsBooked: state.classes[id].booked,
      seatsRemaining: Math.max(0, 20 - state.classes[id].booked),
      isBooked: false, // In a real app we'd check userId
    }));
  },

  // Safe Booking (Atomic-like)
  bookSafe: async (
    classId: ClassId,
    userId: string,
  ): Promise<BookingResponse> => {
    await delay(Math.random() * 200 + 100); // Simulate network latency

    if (!state.classes[classId]) {
      return {
        success: false,
        message: "Invalid Class",
        error: "INVALID_CLASS",
      };
    }

    const currentBooked = state.classes[classId].booked;

    // Strict check
    if (currentBooked >= 20) {
      return {
        success: false,
        message: "Class Full",
        error: "FULL",
        seatsRemaining: 0,
        totalBooked: currentBooked,
      };
    }

    // Atomic update (JS is single threaded so this is safe in memory)
    state.classes[classId].booked++;

    return {
      success: true,
      message: "Booked!",
      seatsRemaining: 20 - state.classes[classId].booked,
      totalBooked: state.classes[classId].booked,
    };
  },

  // Unsafe Booking (Simulated Race Condition)
  bookUnsafe: async (
    classId: ClassId,
    userId: string,
  ): Promise<BookingResponse> => {
    // 1. Read (simulate reading stale data)
    const currentBooked = state.classes[classId].booked;

    // 2. Artificial Delay to widen race window
    await delay(Math.random() * 300 + 300);

    // 3. Optimistic Check (based on stale read)
    if (currentBooked >= 20) {
      return {
        success: false,
        message: "Class Full",
        error: "FULL",
        seatsRemaining: 0,
        totalBooked: state.classes[classId].booked, // Return *actual* current
      };
    }

    // 4. Write (blind increment)
    // NOTE: In a real DB this would be an UPDATE without a WHERE clause check, or separate SELECT/UPDATE transactions
    // Here we simulate it by incrementing the *live* state but the decision was made on *stale* state?
    // Actually, in JS memory, `state.classes[classId].booked` is always fresh.
    // To simulate unsafe behavior I need to allow it to go over 20 if multiple requests are in flight.

    // But since JS is event loop based, `bookUnsafe` is async.
    // If I call `bookUnsafe` 25 times in parallel:
    // All 25 will read `currentBooked` (e.g. 0).
    // All 25 will await delay.
    // All 25 will check `if (0 >= 20)`. False.
    // All 25 will increment.
    // Result: 25 bookings.

    state.classes[classId].booked++;

    return {
      success: true,
      message: "Booked (Unsafe)",
      seatsRemaining: 20 - state.classes[classId].booked,
      totalBooked: state.classes[classId].booked,
    };
  },

  simulateRush: async (
    classId: ClassId,
    mode: "safe" | "unsafe",
    count: number,
  ) => {
    // Fire all requests in parallel
    const promises = Array.from({ length: count }, (_, i) => {
      const userId = `sim-user-${Date.now()}-${i}`;
      return mode === "safe"
        ? mockApi.bookSafe(classId, userId)
        : mockApi.bookUnsafe(classId, userId);
    });

    const results = await Promise.allSettled(promises);
    return results;
  },
};
