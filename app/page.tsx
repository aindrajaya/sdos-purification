"use client";

import {
  ChangeEventHandler,
  Dispatch,
  FormEvent,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AutonomyLevel,
  GlassBoxTrace,
  IntakeFormState,
  SdosExecutionResponse,
  WorkflowApiResponse,
  mockReport,
  normalizeWorkflowResponse,
} from "./lib/sdos";

// Generate a unique session ID
function generateSessionId(): string {
  return `sdos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Live progress state for real-time updates
interface LiveProgress {
  step: number;
  agent: string;
  status: "pending" | "running" | "completed" | "error";
  description: string;
  detail?: string;
  timestamp?: string;
  data?: {
    extracted_specs?: any;
    compliance_research?: any;
    optimization_proposal?: any;
  };
}

const WORKFLOW_ENDPOINT = "/api/sdos";
const workflowConfigured =
  Boolean(
    process.env.NEXT_PUBLIC_SDOS_WEBHOOK ??
      process.env.NEXT_PUBLIC_SDOS_READY,
  );

const initialFormState: IntakeFormState = {
  projectName: "North Basin Polishing Loop",
  blueprintName: "north-station-static-mixer-blueprint.pdf",
  autonomyLevel: "human_approval",
  flowVelocity: "2.3",
  operatingTemp: "90",
  notes: "Validate turbulence before pushing to ERP.",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const numberFormatter = new Intl.NumberFormat("en-US");

export default function Home() {
  const [formState, setFormState] = useState<IntakeFormState>(initialFormState);
  const [uploadPreview, setUploadPreview] = useState<{
    name: string;
    size: number;
  } | null>(null);
  const [blueprintBase64, setBlueprintBase64] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [response, setResponse] =
    useState<SdosExecutionResponse>(mockReport);

  // Live progress tracking state
  const [liveProgress, setLiveProgress] = useState<LiveProgress[]>([]);
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [isReportExpanded, setIsReportExpanded] = useState(true);
  const [isLiveAgentTraceExpanded, setIsLiveAgentTraceExpanded] = useState(true);
  const [phase1Data, setPhase1Data] = useState<any | null>(null);
  const [phase2Data, setPhase2Data] = useState<any | null>(null);
  const [phase3Data, setPhase3Data] = useState<any | null>(null);
  const [currentRunningPhase, setCurrentRunningPhase] = useState<number | null>(null);
  const [loadingPhases, setLoadingPhases] = useState<Set<number>>(new Set());
  const [phaseTimestamps, setPhaseTimestamps] = useState<Record<number, string>>({});
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Connect to SSE for progress updates
  const connectToProgressStream = useCallback((sessionId: string) => {
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `/api/sdos/progress?sessionId=${encodeURIComponent(sessionId)}`
    );

    eventSource.onmessage = (event) => {
      try {
        const progress = JSON.parse(event.data) as LiveProgress;
        
        // Track current running phase
        if (progress.status === "running") {
          setCurrentRunningPhase(progress.step);
        } else if (progress.status === "completed") {
          setCurrentRunningPhase(null);
        }
        
        // Capture phase-specific data
        if (progress.data) {
          if (progress.step === 1 && progress.data.extracted_specs) {
            setPhase1Data(progress.data.extracted_specs);
          } else if (progress.step === 2 && progress.data.compliance_research) {
            setPhase2Data(progress.data.compliance_research);
          } else if (progress.step === 3 && progress.data.optimization_proposal) {
            setPhase3Data(progress.data.optimization_proposal);
          }
        }
        
        // Record timestamp and remove loading state
        setPhaseTimestamps(prev => ({ ...prev, [progress.step]: progress.timestamp || new Date().toISOString() }));
        if (progress.status === "completed") {
          setLoadingPhases(prev => {
            const next = new Set(prev);
            next.delete(progress.step);
            
            // If all phases are complete, stop the workflow
            if (next.size === 0) {
              console.log("✅ All phases complete, closing workflow");
              setIsWorkflowRunning(false);
              // Close SSE connection
              setTimeout(() => {
                if (eventSourceRef.current) {
                  eventSourceRef.current.close();
                  eventSourceRef.current = null;
                }
              }, 1000); // Small delay to ensure all updates processed
            }
            
            return next;
          });
        }
        
        // Update live progress
        setLiveProgress((prev) => {
          const existing = prev.findIndex((p) => p.step === progress.step);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = progress;
            return updated;
          }
          return [...prev, progress].sort((a, b) => a.step - b.step);
        });
      } catch {
        // Ignore invalid JSON (might be keep-alive)
      }
    };

    eventSource.onerror = () => {
      // Connection lost or ended - this is normal when workflow completes
      console.log("SSE connection closed");
      eventSource.close();
      setIsWorkflowRunning(false);
    };

    eventSourceRef.current = eventSource;
  }, []);

  // Cleanup SSE connection on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Merge live progress with the final report's glass_box_trace
  const mergedGlassBoxTrace = useMemo((): GlassBoxTrace[] => {
    if (liveProgress.length === 0 || !isWorkflowRunning) {
      return response.sdos_report.glass_box_trace;
    }

    // When workflow is running, use live progress
    return liveProgress.map((p) => ({
      step: p.step,
      agent: p.agent,
      status: p.status === "error" ? "completed" : p.status,
      description: p.description,
      detail: p.detail,
      timestamp: p.timestamp,
      data: p.data,
    }));
  }, [liveProgress, isWorkflowRunning, response.sdos_report.glass_box_trace]);


  // Note: No longer using hardcoded response data.
  // All report data comes from real-time phase state (phase1Data, phase2Data, phase3Data)
  // which are populated directly from n8n SSE progress stream.

  const handleFile = (file: File | null) => {
    if (!file) {
      setUploadPreview(null);
      setBlueprintBase64(null);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setSubmissionError("Files must be under 25 MB.");
      return;
    }
    setSubmissionError(null);
    setUploadPreview({ name: file.name, size: file.size });
    void fileToBase64(file)
      .then((encoded) => setBlueprintBase64(encoded))
      .catch(() => {
        setSubmissionError("Failed to read blueprint file. Try again.");
        setBlueprintBase64(null);
      });
    setFormState((prev) => ({
      ...prev,
      blueprintName: file.name,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmissionError(null);
    setIsSubmitting(true);
    setIsWorkflowRunning(true);
    setLiveProgress([]);
    
    // Initialize loading states for all phases
    setLoadingPhases(new Set([1, 2, 3]));
    setPhase1Data(null);
    setPhase2Data(null);
    setPhase3Data(null);
    setPhaseTimestamps({});
    setCurrentRunningPhase(null);

    // Generate a unique session ID for this workflow run
    const sessionId = generateSessionId();
    sessionIdRef.current = sessionId;

    // Connect to SSE before starting the workflow
    connectToProgressStream(sessionId);

    try {
      if (!blueprintBase64) {
        throw new Error("Upload a blueprint file to send to the workflow.");
      }

      const payload = {
        file_data: blueprintBase64,
        autonomy_level: formState.autonomyLevel,
        filename:
          uploadPreview?.name ||
          formState.blueprintName ||
          "blueprint.pdf",
        session_id: sessionId,
      };

      const apiResponse = await fetch(WORKFLOW_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!apiResponse.ok) {
        const errorBody = await apiResponse.text();
        
        // Special handling for 503 (timeout) - workflow is still running
        if (apiResponse.status === 503) {
          console.log("⏱️ Workflow processing in background (timeout)...", { sessionId });
          setSubmissionError(
            "Analysis is running in the background. Watch the live trace for updates."
          );
          return; // Don't throw - keep SSE connection alive
        }
        
        throw new Error(
          `Workflow error (${apiResponse.status}): ${errorBody || "No response body"}`
        );
      }

      const json = (await apiResponse.json()) as WorkflowApiResponse;
      
      // If response contains a status field (not full workflow data), workflow is processing
      if ('status' in json && json.status === 'processing') {
        console.log("✅ Workflow started, waiting for SSE updates...", { sessionId });
        // Don't set response - wait for SSE to deliver data
        // Don't close SSE - keep it alive for updates
        setIsSubmitting(false);
        // Keep isWorkflowRunning true
        return;
      }
      
      // Legacy: If we got full workflow data immediately (old behavior)
      const normalized = normalizeWorkflowResponse(json, {
        formState,
        uploadName: uploadPreview?.name ?? formState.blueprintName,
      });
      setResponse(normalized);
    } catch (error) {
      console.error("❌ Submission error:", error);
      setSubmissionError(
        error instanceof Error
          ? `${error.message} • Results will display as they arrive.`
          : "Workflow call failed • Results will display as they arrive."
      );
      // Keep the workflow running - SSE will deliver the results
      setIsSubmitting(false);
      return; // Don't close SSE - keep it alive
    } finally {
      setIsSubmitting(false);
    }
  };

  const flowVelocityMs = parseFloat(formState.flowVelocity) || 0;
  
  // Calculate Reynolds gap from actual phase data if available
  const targetReynolds = phase3Data?.optimization_proposal?.target_reynolds ?? 4000;
  const currentReynolds = phase1Data?.extracted_data?.Reynolds_number ?? 0;
  const reynoldsGap = Math.max(0, targetReynolds - currentReynolds);
  
  // Determine flow regime
  const flowRegime = currentReynolds >= 4000 ? "Turbulent" : "Transitional";

  const glassBoxProgress = useMemo(() => {
    const trace = mergedGlassBoxTrace;
    const total = trace.length || 3; // Default to 3 agents
    if (total === 0) {
      return 0;
    }
    const completed = trace.filter(
      (step) => step.status === "completed",
    ).length;
    const running = trace.filter(
      (step) => step.status === "running",
    ).length;
    // Running counts as partial progress
    return Math.round(((completed + running * 0.5) / total) * 100);
  }, [mergedGlassBoxTrace]);

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-500">
                Project
              </p>
              <h1 className="text-3xl font-semibold text-slate-900">
                {formState.projectName || "Untitled Purification Line"}
              </h1>
              <p className="text-sm text-slate-500">
                {phase3Data ? "Analysis Complete" : isWorkflowRunning ? "Analysis Running..." : "Ready to analyze"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <StatusPill
                tone={phase3Data ? "success" : "info"}
                label={phase3Data ? "Complete" : "In Progress"}
              />
              <StatusPill
                tone={phase2Data ? "success" : formState.autonomyLevel === "full_auto" ? "info" : "neutral"}
                label={phase2Data ? "Compliant" : "Pending"}
              />
              <StatusPill
                tone={
                  formState.autonomyLevel === "full_auto"
                    ? "info"
                    : ("neutral" as const)
                }
                label={
                  formState.autonomyLevel === "full_auto"
                    ? "Full Auto"
                    : "Human Approval"
                }
              />
            </div>
          </div>
          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
            <MetricCard
              label="Current Reynolds"
              value={
                currentReynolds
                  ? numberFormatter.format(currentReynolds)
                  : "Extracting..."
              }
              subtext={`Target ≥ ${numberFormatter.format(targetReynolds)}`}
            />
            <MetricCard
              label="Flow Regime"
              value={phase1Data ? flowRegime : "Pending"}
              subtext={
                phase1Data
                  ? reynoldsGap > 0
                    ? `${numberFormatter.format(reynoldsGap)} to go`
                    : "Meets turbulence requirement"
                  : "Awaiting extraction..."
              }
            />
            <MetricCard
              label="Status"
              value={
                phase3Data
                  ? phase3Data.final_recommendation?.replace(/_/g, " ") || "Complete"
                  : "Processing"
              }
              subtext={
                phase1Data && phase2Data && phase3Data
                  ? "All phases complete"
                  : `${[phase1Data, phase2Data, phase3Data].filter(Boolean).length} of 3 phases complete`
              }
            />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <section className="space-y-6">
            <BlueprintIntakeCard
              formState={formState}
              setFormState={setFormState}
              handleSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              uploadPreview={uploadPreview}
              handleFile={handleFile}
              workflowConfigured={workflowConfigured}
              submissionError={submissionError}
            />
            <AutonomyCard
              autonomy={formState.autonomyLevel}
              onChange={(level) =>
                setFormState((prev) => ({ ...prev, autonomyLevel: level }))
              }
              flowVelocity={flowVelocityMs}
            />
          </section>

          <section className="space-y-6">
            <AgentTraceCard
              trace={mergedGlassBoxTrace}
              progress={glassBoxProgress}
              isRunning={isWorkflowRunning}
              expandedSteps={expandedSteps}
              onToggleExpand={(step) => {
                setExpandedSteps((prev) => {
                  const next = new Set(prev);
                  if (next.has(step)) {
                    next.delete(step);
                  } else {
                    next.add(step);
                  }
                  return next;
                });
              }}
              isExpanded={isLiveAgentTraceExpanded}
              onToggleExpandCard={() => setIsLiveAgentTraceExpanded(!isLiveAgentTraceExpanded)}
            />
            <ReportCard
              phase1Data={phase1Data}
              phase2Data={phase2Data}
              phase3Data={phase3Data}
              loadingPhases={loadingPhases}
              currentRunningPhase={currentRunningPhase}
              phaseTimestamps={phaseTimestamps}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function BlueprintIntakeCard({
  formState,
  setFormState,
  handleSubmit,
  isSubmitting,
  uploadPreview,
  handleFile,
  workflowConfigured,
  submissionError,
}: {
  formState: IntakeFormState;
  setFormState: Dispatch<SetStateAction<IntakeFormState>>;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  uploadPreview: { name: string; size: number } | null;
  handleFile: (file: File | null) => void;
  workflowConfigured: boolean;
  submissionError: string | null;
}) {
  const fileDescription = uploadPreview
    ? `${uploadPreview.name} · ${formatBytes(uploadPreview.size)}`
    : "Drop blueprint PDF/PNG or browse files";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Blueprint intake
        </h2>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Phase 0
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Upload the purification blueprint, add sensor context, and launch the
        S-DOS agent stack.
      </p>
      {!workflowConfigured && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          Set <code>SDOS_WEBHOOK</code> (server) or a{" "}
          <code>NEXT_PUBLIC_SDOS_READY</code> flag in your env file so this UI
          knows the n8n workflow is reachable. Without it, submissions continue
          to fall back to mocked data if the proxy call fails.
        </div>
      )}

      <label
        htmlFor="blueprint-file"
        className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center text-slate-500 transition hover:border-slate-400 hover:bg-white"
      >
        <div className="rounded-full bg-slate-100 p-3 text-slate-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-6 w-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16V4m0 12 3-3m-3 3-3-3M6 20h12a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-1"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 20a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h1"
            />
          </svg>
        </div>
        <p className="text-sm font-medium">{fileDescription}</p>
        <p className="text-xs text-slate-400">Max 25 MB • kept on-device</p>
      </label>
      <input
        id="blueprint-file"
        type="file"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        accept="application/pdf,image/png,image/jpeg"
      />

      <div className="mt-5 space-y-4 text-sm">
        <Field
          label="Project name"
          value={formState.projectName}
          onChange={(event) =>
            setFormState((prev) => ({
              ...prev,
              projectName: event.target.value,
            }))
          }
        />
        <Field
          label="Blueprint filename"
          value={formState.blueprintName}
          onChange={(event) =>
            setFormState((prev) => ({
              ...prev,
              blueprintName: event.target.value,
            }))
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Flow velocity (m/s)"
            value={formState.flowVelocity}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                flowVelocity: event.target.value,
              }))
            }
          />
          <Field
            label="Operating temperature (°C)"
            value={formState.operatingTemp}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                operatingTemp: event.target.value,
              }))
            }
          />
        </div>
        <label className="text-sm font-medium text-slate-700">
          Operator notes
          <textarea
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
            rows={3}
            value={formState.notes}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                notes: event.target.value,
              }))
            }
          />
        </label>
      </div>

      {submissionError && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {submissionError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-400"
      >
        {isSubmitting ? "Routing to agents..." : "Run S-DOS agents"}
      </button>
    </form>
  );
}

function AutonomyCard({
  autonomy,
  onChange,
  flowVelocity,
}: {
  autonomy: AutonomyLevel;
  onChange: (level: AutonomyLevel) => void;
  flowVelocity: number;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Autonomy & handoff
        </h2>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Phase gate
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Decide whether the mock ERP action should trigger automatically or wait
        for engineer approval.
      </p>
      <div className="mt-4 grid gap-3">
        <AutonomyToggle
          label="Human approval"
          description="Route the optimization pack back to control room."
          active={autonomy === "human_approval"}
          onClick={() => onChange("human_approval")}
        />
        <AutonomyToggle
          label="Full auto (ERP)"
          description="Push compliant work orders directly to the mock ERP endpoint."
          active={autonomy === "full_auto"}
          onClick={() => onChange("full_auto")}
        />
      </div>
      <dl className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
        <div className="flex items-center justify-between">
          <dt>Flow velocity reference</dt>
          <dd className="font-semibold text-slate-900">
            {flowVelocity ? `${flowVelocity.toFixed(1)} m/s` : "n/a"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function AutonomyToggle({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p
        className={`text-xs ${
          active ? "text-slate-100" : "text-slate-500"
        }`}
      >
        {description}
      </p>
    </button>
  );
}

function PhaseLoadingSkeleton({ phaseNumber }: { phaseNumber: 1 | 2 | 3 }) {
  const titles: Record<number, string> = {
    1: "Extraction",
    2: "Compliance Research",
    3: "Optimization",
  };

  return (
    <section className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 animate-fadeInSlide">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Phase {phaseNumber} · {titles[phaseNumber]}
          </p>
          <div className="mt-2 h-6 w-48 animate-shimmer rounded-lg bg-slate-200" />
        </div>
        <div className="h-6 w-32 animate-shimmer rounded-full bg-slate-200" />
      </header>
      <div className="mt-4 space-y-3">
        <div className="h-4 w-full animate-shimmer rounded bg-slate-200" />
        <div className="h-4 w-5/6 animate-shimmer rounded bg-slate-200" />
        <div className="h-4 w-4/6 animate-shimmer rounded bg-slate-200" />
      </div>
    </section>
  );
}

function AgentTraceCard({
  trace,
  progress,
  isRunning,
  expandedSteps,
  onToggleExpand,
  isExpanded,
  onToggleExpandCard,
}: {
  trace: GlassBoxTrace[];
  progress: number;
  isRunning: boolean;
  expandedSteps: Set<number>;
  onToggleExpand: (step: number) => void;
  isExpanded: boolean;
  onToggleExpandCard: () => void;
}) {
  // Determine the tone for each status
  const getStatusTone = (status: GlassBoxTrace["status"]): StatusTone => {
    switch (status) {
      case "completed":
        return "success";
      case "running":
        return "info";
      case "pending":
      default:
        return "neutral";
    }
  };

  const getStatusLabel = (status: GlassBoxTrace["status"]): string => {
    switch (status) {
      case "completed":
        return "Done";
      case "running":
        return "Processing";
      case "pending":
      default:
        return "Waiting";
    }
  };

  const renderProgressData = (step: GlassBoxTrace) => {
    if (!step.data) return null;

    const isExpanded = expandedSteps.has(step.step);
    const hasData = step.data.extracted_specs || step.data.compliance_research || step.data.optimization_proposal;

    if (!hasData) return null;

    return (
      <div className="mt-3">
        <button
          onClick={() => onToggleExpand(step.step)}
          className="flex items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-700 transition"
        >
          <svg
            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {isExpanded ? 'Hide' : 'View'} results
        </button>
        
        {isExpanded && (
          <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
            {/* Phase 1: Extraction Results */}
            {step.data.extracted_specs && (
              <div className="space-y-2">
                <p className="font-semibold text-slate-700">🔍 Extracted Specifications</p>
                <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
                  <div>
                    <dt className="text-slate-500">Component</dt>
                    <dd className="font-medium text-slate-900">
                      {step.data.extracted_specs.extracted_data?.component_type || 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Material</dt>
                    <dd className="font-medium text-slate-900">
                      {step.data.extracted_specs.extracted_data?.material || 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Diameter</dt>
                    <dd className="font-medium text-slate-900">
                      {step.data.extracted_specs.extracted_data?.dimensions?.diameter_inch
                        ? `${step.data.extracted_specs.extracted_data.dimensions.diameter_inch}"`
                        : 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Reynolds #</dt>
                    <dd className="font-medium text-slate-900">
                      {step.data.extracted_specs.extracted_data?.Reynolds_number
                        ? step.data.extracted_specs.extracted_data.Reynolds_number.toLocaleString()
                        : 'N/A'}
                    </dd>
                  </div>
                </dl>
                <p className="text-slate-500">
                  Confidence: <span className="font-medium">{step.data.extracted_specs.extraction_confidence}</span>
                </p>
              </div>
            )}

            {/* Phase 2: Research Results */}
            {step.data.compliance_research && (
              <div className="space-y-2">
                <p className="font-semibold text-slate-700">📚 Compliance Research</p>
                <div className="rounded-lg bg-slate-50 p-3 space-y-2">
                  <p className="text-slate-600">
                    {typeof step.data.compliance_research.standards_found === 'string'
                      ? step.data.compliance_research.standards_found.substring(0, 200) + '...'
                      : 'Research completed'}
                  </p>
                  {step.data.compliance_research.citations && step.data.compliance_research.citations.length > 0 && (
                    <div>
                      <p className="text-slate-500 font-medium mb-1">Citations:</p>
                      <ul className="list-disc list-inside space-y-1 text-slate-600">
                        {step.data.compliance_research.citations.slice(0, 3).map((citation: string, i: number) => (
                          <li key={i} className="truncate">{citation}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Phase 3: Optimization Results */}
            {step.data.optimization_proposal && (
              <div className="space-y-2">
                <p className="font-semibold text-slate-700">⚡ Optimization Proposal</p>
                <div className="rounded-lg bg-slate-50 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <dt className="text-slate-500">Recommendation</dt>
                      <dd className="font-medium text-slate-900">
                        {step.data.optimization_proposal.final_recommendation?.replace(/_/g, ' ') || 'N/A'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Requires Optimization</dt>
                      <dd className="font-medium text-slate-900">
                        {step.data.optimization_proposal.requires_optimization ? 'Yes' : 'No'}
                      </dd>
                    </div>
                  </div>
                  {step.data.optimization_proposal.summary && (
                    <p className="text-slate-600 italic">
                      {step.data.optimization_proposal.summary}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Live agent trace
        </h2>
        <button
          onClick={onToggleExpandCard}
          className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition"
        >
          <span className="uppercase tracking-wide">Steps</span>
          <svg
            className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      <div className="flex items-center gap-2 mt-2">
        {isRunning && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
              </span>
              Live
            </span>
          )}
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Glass box
          </span>
        </div>
      <p className="mt-1 text-sm text-slate-500">
        Every phase of the S-DOS workflow stays visible for audits and
        interviews.
      </p>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isRunning
                ? "bg-gradient-to-r from-blue-600 to-blue-400 animate-pulse"
                : "bg-gradient-to-r from-slate-900 to-blue-600"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ol className="mt-6 space-y-4 animate-fadeInSlide">
        {isExpanded ? trace.map((step) => (
          <li
            key={step.step}
            className={`flex gap-4 rounded-2xl border p-4 transition-all duration-300 ${
              step.status === "running"
                ? "border-blue-200 bg-blue-50/70 ring-2 ring-blue-100"
                : step.status === "completed"
                  ? "border-emerald-100 bg-emerald-50/50"
                  : "border-slate-100 bg-slate-50/70"
            }`}
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold transition-all ${
                step.status === "running"
                  ? "bg-blue-500 text-white animate-pulse"
                  : step.status === "completed"
                    ? "bg-emerald-500 text-white"
                    : "bg-white text-slate-700"
              }`}
            >
              {step.status === "completed" ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : step.status === "running" ? (
                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                step.step
              )}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {step.agent}
                </p>
                <StatusPill
                  tone={getStatusTone(step.status)}
                  label={getStatusLabel(step.status)}
                />
              </div>
              <p className="text-sm text-slate-600">{step.description}</p>
              {step.detail && (
                <p className="text-xs text-slate-400">{step.detail}</p>
              )}
              {step.timestamp && (
                <p className="text-xs text-slate-400">
                  {dateFormatter.format(new Date(step.timestamp))}
                </p>
              )}
              {renderProgressData(step)}
            </div>
          </li>
        )) : null}
      </ol>

      {!isExpanded && (
        <div className="mt-4 text-sm text-slate-500">
          {trace.filter(t => t.status === "completed").length} of {trace.length} agents complete
        </div>
      )}
    </div>
  );
}

function PhaseSection({
  phase,
  title,
  data,
  isLoading,
  isRunning,
}: {
  phase: 1 | 2 | 3;
  title: string;
  data: any;
  isLoading: boolean;
  isRunning: boolean;
}) {
  if (isLoading) {
    return <PhaseLoadingSkeleton phaseNumber={phase} />;
  }

  if (!data && !isRunning) {
    return null;
  }

  return (
    <section
      className={`
        rounded-2xl border border-slate-100 bg-slate-50/60 p-4
        ${isRunning ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100 shadow-lg shadow-blue-300/50' : ''}
        ${data ? 'animate-fadeInSlide' : ''}
        phase-transition
      `}
    >
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Phase {phase} · {title}
          </p>
          {data && (
            <h3 className="text-base font-semibold text-slate-900">
              {phase === 1 && data.extracted_data?.component_type}
              {phase === 2 && 'Compliance Standards Found'}
              {phase === 3 && (data.final_recommendation || 'Optimization Complete')}
            </h3>
          )}
        </div>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
            </span>
            Live updating
          </span>
        )}
      </header>

      {/* Phase 1: Extraction */}
      {phase === 1 && data && (
        <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Diameter</dt>
            <dd className="text-slate-900">
              {data.extracted_data?.dimensions?.diameter_inch ? `${data.extracted_data.dimensions.diameter_inch}"` : 'N/A'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Material</dt>
            <dd className="text-slate-900">{data.extracted_data?.material || 'N/A'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Reynolds #</dt>
            <dd className="text-slate-900">
              {data.extracted_data?.Reynolds_number ? data.extracted_data.Reynolds_number.toLocaleString() : 'N/A'}
            </dd>
          </div>
        </dl>
      )}

      {/* Phase 2: Research */}
      {phase === 2 && data && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-600">
            {typeof data.standards_found === 'string' ? data.standards_found.substring(0, 300) + '...' : 'Research data processing...'}
          </p>
          {data.citations && data.citations.length > 0 && (
            <div className="rounded-lg bg-slate-100/50 p-2">
              <p className="text-xs font-medium text-slate-600 mb-2">Citations: {data.citations.length}</p>
              <ul className="space-y-1">
                {data.citations.slice(0, 2).map((citation: string, i: number) => (
                  <li key={i} className="text-xs text-slate-600 truncate">• {citation}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Phase 3: Optimization */}
      {phase === 3 && data && (
        <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Recommendation</dt>
            <dd className="text-slate-900 font-semibold">
              {data.final_recommendation?.replace(/_/g, ' ') || 'Pending'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Requires Optimization</dt>
            <dd className="text-slate-900">
              {data.optimization_proposal?.requires_optimization ? 'Yes' : 'No'}
            </dd>
          </div>
          {data.summary && (
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Summary</dt>
              <dd className="text-slate-600 italic mt-1">{data.summary}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

function ReportCard({
  phase1Data,
  phase2Data,
  phase3Data,
  loadingPhases,
  currentRunningPhase,
  phaseTimestamps,
}: {
  phase1Data: any;
  phase2Data: any;
  phase3Data: any;
  loadingPhases: Set<number>;
  currentRunningPhase: number | null;
  phaseTimestamps: { [key: number]: string };
}) {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <section className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-6 lg:p-8">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          S-DOS Report
        </p>
        <h3 className="text-xl font-semibold text-slate-900">
          {phase3Data ? "Analysis Complete" : currentRunningPhase ? `Phase ${currentRunningPhase} Running...` : "Ready to analyze"}
        </h3>
      </div>

      {/* Phase 1: Extraction */}
      <PhaseSection
        phase={1}
        title="Vision Extraction"
        data={phase1Data}
        isLoading={loadingPhases.has(1)}
        isRunning={currentRunningPhase === 1}
      />

      {/* Phase 2: Compliance Research */}
      <PhaseSection
        phase={2}
        title="Compliance Research"
        data={phase2Data}
        isLoading={loadingPhases.has(2)}
        isRunning={currentRunningPhase === 2}
      />

      {/* Phase 3: Optimization */}
      <PhaseSection
        phase={3}
        title="Design Optimization"
        data={phase3Data}
        isLoading={loadingPhases.has(3)}
        isRunning={currentRunningPhase === 3}
      />
    </section>
  );
}

function MetricCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{subtext}</p>
    </div>
  );
}

type StatusTone = "success" | "warning" | "info" | "neutral";

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  const toneClasses: Record<StatusTone, string> = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-100",
    warning: "bg-amber-50 text-amber-700 border-amber-100",
    info: "bg-blue-50 text-blue-700 border-blue-100",
    neutral: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
        value={value}
        onChange={onChange}
      />
    </label>
  );
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB"];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(1)} ${units[idx]}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const [, base64] = result.split(",");
      resolve(base64 ?? result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function buildReportFromForm(
  formState: IntakeFormState,
  uploadPreview: { name: string; size: number } | null,
): SdosExecutionResponse {
  const cloned: SdosExecutionResponse = JSON.parse(JSON.stringify(mockReport));
  cloned.sdos_report.report_id = `SDOS-${Date.now()}`;
  cloned.sdos_report.generated_at = new Date().toISOString();
  cloned.execution_status =
    formState.autonomyLevel === "full_auto"
      ? "AUTO_EXECUTED"
      : "WAITING_FOR_APPROVAL";
  cloned.requires_approval = formState.autonomyLevel !== "full_auto";
  cloned.message =
    cloned.execution_status === "AUTO_EXECUTED"
      ? "Work order automatically created in ERP system."
      : "Optimization proposal requires human approval before ERP execution.";

  cloned.sdos_report.extraction_phase.blueprint_reference = {
    filename: uploadPreview?.name || formState.blueprintName,
    autonomy_level: formState.autonomyLevel,
    uploaded_at: new Date().toISOString(),
  };

  const flowVelocity = parseFloat(formState.flowVelocity);
  if (!Number.isNaN(flowVelocity)) {
    const baseVelocity = 2.3;
    const ratio = flowVelocity / baseVelocity;
    const currentRe =
      cloned.sdos_report.extraction_phase.extracted_data.Reynolds_number ??
      0;
    const recalculated = Math.round(currentRe * ratio);
    cloned.sdos_report.extraction_phase.extracted_data.Reynolds_number =
      recalculated;
    cloned.sdos_report.optimization_phase.optimization_proposal.current_reynolds =
      recalculated;
  }

  if (formState.notes) {
    cloned.sdos_report.optimization_phase.summary = `${formState.notes} · ${cloned.sdos_report.optimization_phase.summary}`;
  }

  cloned.sdos_report.glass_box_trace = cloned.sdos_report.glass_box_trace.map(
    (step, index) => ({
      ...step,
      timestamp: new Date(Date.now() - (2 - index) * 30_000).toISOString(),
    }),
  );

  return cloned;
}
