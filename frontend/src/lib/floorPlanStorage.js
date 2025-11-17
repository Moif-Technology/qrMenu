const KEY = "moif_floorplan_v1";

export function savePlan(plan) {
  localStorage.setItem(KEY, JSON.stringify(plan));
}

export function loadPlan() {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : { nodes: [] };
  } catch {
    return { nodes: [] };
  }
}
