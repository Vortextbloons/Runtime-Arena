export type MetricStatus = {
  status: "available" | "unavailable";
  unit?: string;
  reason?: string;
};

export type MetricDefinition = {
  id: string;
  availability(): MetricStatus;
};

const registry = new Map<string, MetricDefinition>();

export function registerMetric(metric: MetricDefinition) {
  if (registry.has(metric.id)) throw new Error(`Metric '${metric.id}' is already registered`);
  registry.set(metric.id, metric);
}

export function metricAvailability(ids: string[]) {
  return Object.fromEntries(ids.map(id => {
    const metric = registry.get(id);
    return [id, metric?.availability() ?? { status: "unavailable", reason: `No collector registered for '${id}'` }];
  }));
}

registerMetric({
  id: "kernelTime",
  availability: () => ({ status: "available", unit: "nanoseconds" })
});

registerMetric({
  id: "iterationTime",
  availability: () => ({ status: "available", unit: "nanoseconds" })
});
