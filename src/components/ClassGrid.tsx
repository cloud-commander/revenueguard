import React from "react";
import type { GymClass, ClassId } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ClassGridProps {
  classes: GymClass[];
  onBook: (classId: ClassId) => void;
  isBooking?: boolean;
}

export const ClassGrid: React.FC<ClassGridProps> = ({
  classes,
  onBook,
  isBooking,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {classes.map((cls) => (
        <ClassCard
          key={cls.id}
          cls={cls}
          onBook={onBook}
          isBooking={isBooking}
        />
      ))}
    </div>
  );
};

const ClassCard = ({
  cls,
  onBook,
  isBooking,
}: {
  cls: GymClass;
  onBook: (id: ClassId) => void;
  isBooking?: boolean;
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
          <div className="absolute top-0 right-0 px-3 py-1 bg-destructive text-destructive-foreground text-xs font-bold transform translate-x-1/3 rotate-45">
            OY!
          </div>
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
              <Badge
                variant="secondary"
                className="bg-green-500/10 text-green-500 border-green-500/20"
              >
                Booked
              </Badge>
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
                <span
                  className={cn(
                    "font-mono font-bold",
                    isOverbooked ? "text-destructive" : "text-foreground",
                  )}
                >
                  {cls.seatsBooked} / {cls.capacity}
                </span>
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

            <Button
              className="w-full font-bold relative overflow-hidden group"
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
        </CardContent>
      </Card>
    </motion.div>
  );
};
