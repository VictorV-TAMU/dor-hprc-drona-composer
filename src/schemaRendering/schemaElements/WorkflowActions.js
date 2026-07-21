import React, { useEffect, useMemo, useState } from "react";

function getRecordId(row) {
  return String(row?.job_id ?? row?.drona_id ?? "");
}

function getRuntime(row) {
  const runtime = row?.runtime ?? row?.form_data?.runtime ?? row?.env_params?.runtime;
  if (typeof runtime === "string") return runtime;
  if (runtime && typeof runtime === "object") return runtime.value || runtime.label || "";
  return row?.form_data?.env_name || "";
}

function getEnvironmentName(environment) {
  if (!environment) return "";
  if (typeof environment === "string") return environment;
  return environment.env || environment.value || environment.label || "";
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}

export default function WorkflowActions(props) {
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const envName = getEnvironmentName(props.environment);
  const workflowField = props.workflowField || "allworkflows";

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(`${document.dashboard_url}/jobs/composer/history`, {
          credentials: "same-origin",
        });

        if (!response.ok) {
          throw new Error(`History request failed: ${response.status}`);
        }

        const data = await response.json();
        const list = Array.isArray(data) ? data : [];

        const filtered = envName
          ? list.filter((row) => getRuntime(row) === envName)
          : list;

        if (!cancelled) {
          setRecords(filtered);
          setSelectedId((prev) => {
            if (prev && filtered.some((row) => getRecordId(row) === prev)) return prev;
            return filtered.length > 0 ? getRecordId(filtered[0]) : "";
          });
        }
      } catch (err) {
        console.error("Failed to load workflow history:", err);
        if (!cancelled) {
          setError(err.message || "Failed to load workflow history");
          setRecords([]);
          setSelectedId("");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [envName]);

  useEffect(() => {
    if (selectedId && typeof props.setFieldValue === "function") {
      props.setFieldValue(workflowField, selectedId);
    }
  }, [selectedId, workflowField]);

  const selectedRecord = useMemo(() => {
    return records.find((row) => getRecordId(row) === selectedId) || null;
  }, [records, selectedId]);

  const canRecreate = selectedRecord && typeof props.handleForm === "function";
  const canRerun = selectedRecord && typeof props.handleRerun === "function";

  return (
    <div className="card mb-3">
      <div className="card-header">
        <strong>{props.label || "Workflow Actions"}</strong>
      </div>

      <div className="card-body">
        <label className="form-label">Select workflow for rerun/recreate</label>

        <select
          className="form-select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={isLoading || records.length === 0}
        >
          {records.length === 0 && (
            <option value="">
              {isLoading ? "Loading workflows..." : "No workflows found"}
            </option>
          )}

          {records.map((row) => {
            const id = getRecordId(row);
            const name = row?.name || "unnamed";
            const date = row?.timestamp || row?.start_time || "";
            return (
              <option key={id} value={id}>
                {name} — {id}{date ? ` — ${formatDate(date)}` : ""}
              </option>
            );
          })}
        </select>

        {error && (
          <div className="alert alert-danger mt-3 mb-0">
            {error}
          </div>
        )}

        {selectedRecord && (
          <div className="mt-3">
            <div><strong>Name:</strong> {selectedRecord.name || "unnamed"}</div>
            <div><strong>Drona ID:</strong> {getRecordId(selectedRecord)}</div>
            <div><strong>Location:</strong> {selectedRecord.location || "unknown"}</div>
          </div>
        )}

        <div className="d-flex flex-wrap align-items-center mt-4" style={{ gap: "0.75rem" }}>
          <button
            type="button"
            className="btn btn-primary maroon-button"
            disabled={!canRerun}
            onClick={() => props.handleRerun(selectedRecord)}
          >
            Rerun
          </button>

          <button
            type="button"
            className="btn btn-primary maroon-button"
            disabled={!canRecreate}
            onClick={() => props.handleForm(selectedRecord)}
          >
            Recreate
          </button>
        </div>
      </div>
    </div>
  );
}
