import React from "react";
import type { GymClass, ClassId, BookingMode } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClassGridSkeleton } from "./ClassGridSkeleton";
import { Users, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface ClassGridProps {
  classes: GymClass[];
  onBook: (classId: ClassId) => void;
  isBooking?: boolean;
  mode: BookingMode;
  isLoading?: boolean;
}

export const ClassGrid: React.FC<ClassGridProps> = ({
  classes,
  onBook,
  isBooking,
  mode,
  isLoading,
}) => {
  if (isLoading) {
    return <ClassGridSkeleton count={classes.length || 6} />;
  }

  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-xl bg-card/30 backdrop-blur-sm">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
        <h3 className="text-xl font-bold tracking-tight mb-2">
          No classes found
        </h3>
        <p className="text-muted-foreground max-w-sm px-4">
          Wait for the system to initialize or check the WebSocket connection
          status above.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <AnimatePresence mode="popLayout">
        {classes.map((cls) => (
          <ClassCard
            key={cls.id}
            cls={cls}
            onBook={onBook}
            isBooking={isBooking}
            mode={mode}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

const ClassCard = ({
  cls,
  onBook,
  isBooking,
  mode,
}: {
  cls: GymClass;
  onBook: (id: ClassId) => void;
  isBooking?: boolean;
  mode: BookingMode;
}) => {
  const percentFull = (cls.seatsBooked / cls.capacity) * 100;
  const isFull = cls.seatsBooked >= cls.capacity;
  const isOverbooked = cls.seatsBooked > cls.capacity;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card
        className={cn(
          "relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm transition-all hover:border-primary/50",
          isOverbooked &&
            "border-destructive/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]",
        )}
      >
        {isOverbooked && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute top-0 right-0 px-3 py-1 bg-destructive text-destructive-foreground text-xs font-bold transform translate-x-1/3 rotate-45 cursor-help">
                OY!
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-destructive text-destructive-foreground border-destructive">
              <p className="font-bold">❌ OVERFLOW</p>
              <p className="text-xs opacity-90">
                This booking should not exist! Extra bookings prove the race
                condition.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <Badge
              variant="outline"
              className="mb-2 border-primary/20 text-primary"
            >
              {cls.id}
            </Badge>
            {cls.isBooked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="bg-green-500/10 text-green-500 border-green-500/20 cursor-help"
                  >
                    Booked
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="bg-green-950 border-green-900 text-green-100">
                  <p className="font-bold text-green-400">
                    Booked ✓ ({mode.toUpperCase()})
                  </p>
                  <p className="text-xs text-green-200/80 max-w-[200px]">
                    {mode === "safe"
                      ? "Atomically verified. DO serialization guaranteed this booking."
                      : "Booking succeeded, but may exceed capacity due to race condition."}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">
            {cls.name}
          </CardTitle>
          <div className="flex items-center text-muted-foreground text-sm mt-1">
            <Clock className="w-4 h-4 mr-1" />
            {cls.time}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center">
                  <Users className="w-4 h-4 mr-1" />
                  Capacity
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "font-mono font-bold cursor-help",
                        isOverbooked ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {cls.seatsBooked} / {cls.capacity}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-bold">
                      {cls.seatsBooked === 0 ? "Available" : "Occupancy"}
                    </p>
                    <p className="text-xs opacity-90 max-w-[200px]">
                      {cls.seatsBooked === 0
                        ? "Available — No bookings yet. Ready to accept a new request."
                        : `${cls.seatsBooked} seats booked out of ${cls.capacity}.`}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Progress
                value={Math.min(percentFull, 100)}
                className={cn(
                  "h-2",
                  isOverbooked
                    ? "bg-destructive/20 [&>div]:bg-destructive"
                    : "",
                )}
              />
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full">
                  <Button
                    className="w-full font-bold relative overflow-hidden group min-h-[44px]"
                    onClick={() => onBook(cls.id)}
                    disabled={isFull || isBooking || cls.isBooked}
                    variant={isFull ? "secondary" : "default"}
                  >
                    <span className="relative z-10">
                      {isFull
                        ? isOverbooked
                          ? "Overbooked!"
                          : "Sold Out"
                        : cls.isBooked
                          ? "Booked"
                          : "Book Seat"}
                    </span>
                    {!isFull && !cls.isBooked && (
                      <div className="absolute inset-0 bg-primary/20 transform translate-y-full transition-transform group-hover:translate-y-0" />
                    )}
                  </Button>
                </div>
              </TooltipTrigger>
              {(isFull || isBooking || cls.isBooked) && (
                <TooltipContent>
                  <p>
                    {isBooking
                      ? "Simulation in progress..."
                      : cls.isBooked
                        ? "You have already booked this seat."
                        : isFull
                          ? "Class is at maximum capacity."
                          : ""}
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
