import { pickupSlots } from "./services.mjs";

// Group only this vendor's order snapshots, using Eastern pickup dates.
export function vendorAnalytics(orders, today) {
  const series = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    const day = date.toISOString().slice(0, 10);
    const daily = orders.filter(
      (o) => o.pickup_date === day && o.status !== "cancelled",
    );
    return {
      date: day,
      orders: daily.length,
      completedCents: daily
        .filter((o) => o.status === "completed")
        .reduce((sum, o) => sum + o.total_cents, 0),
      reservedCents: daily
        .filter((o) => o.status !== "completed")
        .reduce((sum, o) => sum + o.total_cents, 0),
    };
  });
  const daily = orders.filter((o) => o.pickup_date === today);
  return {
    series,
    statusCounts: Object.fromEntries(
      ["pending", "confirmed", "completed", "cancelled"].map((status) => [
        status,
        daily.filter((o) => o.status === status).length,
      ]),
    ),
    pickupSummary: pickupSlots.map((slot) => ({
      slot,
      pending: daily.filter(
        (o) => o.pickup_slot === slot && o.status === "pending",
      ).length,
      confirmed: daily.filter(
        (o) => o.pickup_slot === slot && o.status === "confirmed",
      ).length,
      completed: daily.filter(
        (o) => o.pickup_slot === slot && o.status === "completed",
      ).length,
    })),
  };
}
