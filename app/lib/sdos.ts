export type AutonomyLevel = "human_approval" | "full_auto";

export interface Dimensions {
  diameter_inch: number | null;
  angle_degrees: number | null;
  length_meters: number | null;
}

export interface ExtractedSpecs {
  blueprint_reference: {
    filename: string;
    autonomy_level: AutonomyLevel;
    uploaded_at: string;
  };
  extracted_data: {
    component_type: "Static Mixer" | "Pipe" | "Valve" | "Other" | string;
    dimensions: Dimensions;
    material: string;
    Reynolds_number: number | null;
  };
  extraction_confidence: "high" | "medium" | "low";
  notes: string;
}

export interface StandardFinding {
  id: string;
  title: string;
  edition: string;
  published: string;
  summary: string;
  focus: string[];
}

export interface ComplianceResearch {
  standards_consulted: StandardFinding[];
  citations: string[];
  material_researched: string;
  component_researched: string;
  summary_text?: string;
}

export interface ComplianceCheck {
  standard_used: string;
  is_compliant: boolean;
  compliance_details: string;
  citations: string[];
}

export interface SuggestedChanges {
  angle_degrees: number | null;
  diameter_inch: number | null;
  material_upgrade: string | null;
}

export interface OptimizationProposal {
  requires_optimization: boolean;
  current_reynolds: number | null;
  target_reynolds: number;
  suggested_changes: SuggestedChanges;
  predicted_new_reynolds: number | null;
  efficiency_gain_percent: number;
  cost_impact: "low" | "medium" | "high";
  reasoning: string;
}

export interface OptimizationPhase {
  compliance_check: ComplianceCheck;
  optimization_proposal: OptimizationProposal;
  final_recommendation:
    | "APPROVE_CURRENT_DESIGN"
    | "IMPLEMENT_OPTIMIZATION"
    | "REQUIRES_ENGINEERING_REVIEW";
  summary: string;
}

export interface GlassBoxTrace {
  step: number;
  agent: string;
  status: "completed" | "running" | "pending";
  description: string;
  detail?: string;
  timestamp?: string;
  data?: {
    extracted_specs?: any;
    compliance_research?: any;
    optimization_proposal?: any;
  };
}

export interface SdosReport {
  report_id: string;
  generated_at: string;
  extraction_phase: ExtractedSpecs;
  research_phase: ComplianceResearch;
  optimization_phase: OptimizationPhase;
  glass_box_trace: GlassBoxTrace[];
}

export interface SdosExecutionResponse {
  execution_status: "AUTO_EXECUTED" | "WAITING_FOR_APPROVAL";
  message: string;
  sdos_report: SdosReport;
  requires_approval: boolean;
  erp_confirmation?: {
    status: string;
    timestamp: string;
  };
  available_actions?: string[];
  approval_webhook?: string;
}

// Raw workflow response types -----------------------------------------------

interface WorkflowExtractionPhase {
  extracted_data?: ExtractedSpecs["extracted_data"];
  extraction_confidence?: ExtractedSpecs["extraction_confidence"];
  notes?: string;
}

interface WorkflowResearchPhase {
  standards_consulted?: unknown;
  citations?: string[];
  material_researched?: string;
  component_researched?: string;
}

interface WorkflowGlassBoxTrace {
  step?: number;
  agent?: string;
  status?: string;
  description?: string;
  detail?: string;
  timestamp?: string;
}

interface WorkflowOptimizationPhase {
  compliance_check?: Partial<ComplianceCheck>;
  optimization_proposal?: Partial<OptimizationProposal>;
  final_recommendation?: OptimizationPhase["final_recommendation"];
  summary?: string;
}

interface WorkflowReport {
  report_id?: string;
  generated_at?: string;
  extraction_phase?: WorkflowExtractionPhase;
  research_phase?: WorkflowResearchPhase;
  optimization_phase?: WorkflowOptimizationPhase;
  glass_box_trace?: WorkflowGlassBoxTrace[];
}

export interface WorkflowApiResponse {
  execution_status?: "AUTO_EXECUTED" | "WAITING_FOR_APPROVAL";
  message?: string;
  sdos_report?: WorkflowReport;
  erp_confirmation?: {
    status?: string;
    timestamp?: string;
  };
  available_actions?: string[];
  approval_webhook?: string;
  requires_approval?: boolean;
  autonomy_level?: AutonomyLevel;
}

export interface IntakeFormState {
  projectName: string;
  blueprintName: string;
  autonomyLevel: AutonomyLevel;
  flowVelocity: string;
  operatingTemp: string;
  notes: string;
}

export interface NormalizationContext {
  formState: IntakeFormState;
  uploadName?: string | null;
  uploadedAt?: string;
}

const defaultDimensions: Dimensions = {
  diameter_inch: null,
  angle_degrees: null,
  length_meters: null,
};

const defaultExtractionData: ExtractedSpecs["extracted_data"] = {
  component_type: "Static Mixer",
  dimensions: defaultDimensions,
  material: "Unknown",
  Reynolds_number: null,
};

const defaultOptimizationProposal: OptimizationProposal = {
  requires_optimization: true,
  current_reynolds: null,
  target_reynolds: 4000,
  suggested_changes: {
    angle_degrees: null,
    diameter_inch: null,
    material_upgrade: null,
  },
  predicted_new_reynolds: null,
  efficiency_gain_percent: 0,
  cost_impact: "medium",
  reasoning: "Awaiting optimization data.",
};

function coerceStandards(
  value: unknown,
  fallbackSummary?: string,
): { list: StandardFinding[]; summary?: string } {
  if (Array.isArray(value)) {
    const mapped = value.map((item, index) => {
      if (typeof item !== "object" || item === null) {
        return {
          id: `STD-${index + 1}`,
          title: `Standard ${index + 1}`,
          edition: "",
          published: "",
          summary: String(item),
          focus: [],
        };
      }
      const typed = item as Partial<StandardFinding>;
      return {
        id: typed.id ?? `STD-${index + 1}`,
        title: typed.title ?? typed.id ?? `Standard ${index + 1}`,
        edition: typed.edition ?? "",
        published: typed.published ?? "",
        summary: typed.summary ?? fallbackSummary ?? "Details unavailable.",
        focus: Array.isArray(typed.focus)
          ? typed.focus.map((entry) => String(entry))
          : [],
      };
    });
    return { list: mapped, summary: fallbackSummary };
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return {
      list: [
        {
          id: "RESEARCH_SUMMARY",
          title: "Research Summary",
          edition: "",
          published: "",
          summary: value.trim(),
          focus: [],
        },
      ],
      summary: value.trim(),
    };
  }

  return {
    list: [],
    summary: fallbackSummary,
  };
}

export function normalizeWorkflowResponse(
  raw: WorkflowApiResponse,
  context: NormalizationContext,
): SdosExecutionResponse {
  const report = raw.sdos_report ?? {};
  const extractionPhase = report.extraction_phase ?? {};
  const researchPhase = report.research_phase ?? {};
  const optimizationPhase = report.optimization_phase ?? {};

  const blueprintReference = {
    filename:
      context.uploadName ||
      context.formState.blueprintName ||
      "blueprint.pdf",
    autonomy_level: context.formState.autonomyLevel,
    uploaded_at: context.uploadedAt || new Date().toISOString(),
  };

  const extraction: ExtractedSpecs = {
    blueprint_reference: blueprintReference,
    extracted_data: {
      ...defaultExtractionData,
      ...extractionPhase.extracted_data,
      dimensions: {
        ...defaultDimensions,
        ...extractionPhase.extracted_data?.dimensions,
      },
    },
    extraction_confidence:
      extractionPhase.extraction_confidence ?? "medium",
    notes: extractionPhase.notes ?? context.formState.notes ?? "",
  };

  const standards = coerceStandards(
    researchPhase.standards_consulted,
    typeof researchPhase.standards_consulted === "string"
      ? researchPhase.standards_consulted
      : undefined,
  );

  const complianceResearch: ComplianceResearch = {
    standards_consulted: standards.list.length
      ? standards.list
      : [
          {
            id: "PLACEHOLDER",
            title: "Awaiting Standards",
            edition: "",
            published: "",
            summary:
              standards.summary ??
              "The compliance agent did not return structured standards data.",
            focus: [],
          },
        ],
    citations: researchPhase.citations ?? [],
    material_researched:
      researchPhase.material_researched ?? extraction.extracted_data.material,
    component_researched:
      researchPhase.component_researched ??
      extraction.extracted_data.component_type,
    summary_text: standards.summary,
  };

  const complianceCheck: ComplianceCheck = {
    standard_used:
      optimizationPhase.compliance_check?.standard_used ?? "Unknown",
    is_compliant:
      optimizationPhase.compliance_check?.is_compliant ?? false,
    compliance_details:
      optimizationPhase.compliance_check?.compliance_details ??
      "Compliance agent did not return a finding.",
    citations: optimizationPhase.compliance_check?.citations ?? [],
  };

  const optimizationProposal: OptimizationProposal = {
    ...defaultOptimizationProposal,
    ...optimizationPhase.optimization_proposal,
    suggested_changes: {
      ...defaultOptimizationProposal.suggested_changes,
      ...optimizationPhase.optimization_proposal?.suggested_changes,
    },
  };

  const optimization: OptimizationPhase = {
    compliance_check: complianceCheck,
    optimization_proposal: optimizationProposal,
    final_recommendation:
      optimizationPhase.final_recommendation ??
      (optimizationProposal.requires_optimization
        ? "IMPLEMENT_OPTIMIZATION"
        : "APPROVE_CURRENT_DESIGN"),
    summary:
      optimizationPhase.summary ??
      "Design optimizer response was not available.",
  };

  const glassTraceRaw = report.glass_box_trace ?? [];
  const generated = report.generated_at
    ? new Date(report.generated_at).getTime()
    : Date.now();
  const glass_box_trace: GlassBoxTrace[] = glassTraceRaw.map(
    (entry, index) => ({
      step: entry.step ?? index + 1,
      agent: entry.agent ?? `Agent ${index + 1}`,
      status:
        entry.status === "running" || entry.status === "pending"
          ? entry.status
          : "completed",
      description:
        entry.description ?? "Workflow step completed without details.",
      detail: entry.detail ?? entry.description,
      timestamp:
        entry.timestamp ??
        new Date(generated - (glassTraceRaw.length - index) * 15000).toISOString(),
    }),
  );

  const normalizedReport: SdosReport = {
    report_id: report.report_id ?? `SDOS-${Date.now()}`,
    generated_at:
      report.generated_at ?? new Date().toISOString(),
    extraction_phase: extraction,
    research_phase: complianceResearch,
    optimization_phase: optimization,
    glass_box_trace,
  };

  const executionStatus =
    raw.execution_status ?? "WAITING_FOR_APPROVAL";
  const requiresApproval =
    raw.requires_approval ??
    (executionStatus !== "AUTO_EXECUTED");

  return {
    execution_status: executionStatus,
    message:
      raw.message ??
      (executionStatus === "AUTO_EXECUTED"
        ? "Work order automatically created in ERP system."
        : "Optimization proposal requires human approval before ERP execution."),
    sdos_report: normalizedReport,
    requires_approval: requiresApproval,
    erp_confirmation: raw.erp_confirmation as
      | { status: string; timestamp: string }
      | undefined,
    available_actions: raw.available_actions,
    approval_webhook: raw.approval_webhook,
  };
}

export const mockReport: SdosExecutionResponse = {
  execution_status: "WAITING_FOR_APPROVAL",
  message:
    "Optimization proposal requires human approval before ERP execution.",
  requires_approval: true,
  sdos_report: {
    report_id: "SDOS-1737563001123",
    generated_at: "2026-01-22T18:15:02.904Z",
    extraction_phase: {
      blueprint_reference: {
        filename: "north-station-static-mixer-blueprint.pdf",
        autonomy_level: "human_approval",
        uploaded_at: "2026-01-22T18:13:11.904Z",
      },
      extracted_data: {
        component_type: "Static Mixer",
        dimensions: {
          diameter_inch: 6,
          angle_degrees: 35,
          length_meters: 2.4,
        },
        material: "Duplex Stainless Steel (UNS S32205)",
        Reynolds_number: 3120,
      },
      extraction_confidence: "medium",
      notes:
        "Annotation layers partially occluded calibration grid. Flow velocity note = 2.3 m/s at 35 deg blade pitch.",
    },
    research_phase: {
      material_researched: "Duplex Stainless Steel (UNS S32205)",
      component_researched: "Static Mixer",
      citations: [
        "ASTM A790/A790M-22",
        "ASME B31.3-2024",
        "ISO 9001:2015",
        "ISO 14001:2015",
      ],
      standards_consulted: [
        {
          id: "ASTM A790/A790M",
          title:
            "Standard Specification for Seamless and Welded Ferritic/Austenitic Stainless Steel Pipe",
          edition: "2022",
          published: "2022-10-01",
          summary:
            "Covers chemistry, tensile strength, NDE, and hydrostatic testing requirements for duplex stainless steel piping used in corrosive service.",
          focus: [
            "Materials chemistry",
            "Corrosion resistance",
            "Hydrostatic test",
          ],
        },
        {
          id: "ASME B31.3",
          title: "Process Piping",
          edition: "2024",
          published: "2024-05-15",
          summary:
            "Defines allowable stress, weld procedure qualifications, and pressure design rules for chemical and petroleum facilities.",
          focus: ["Pressure design", "Welding QA/QC", "Documentation"],
        },
        {
          id: "ISO 14001",
          title: "Environmental Management Systems",
          edition: "2015",
          published: "2015-09-14",
          summary:
            "Ensures emissions monitoring and wastewater management around purification stations.",
          focus: ["Environmental monitoring", "Wastewater management"],
        },
      ],
    },
    optimization_phase: {
      compliance_check: {
        standard_used: "ASME B31.3-2024",
        is_compliant: false,
        compliance_details:
          "Calculated hoop stress exceeds 85% of allowable for UNS S32205 at 90 C. Requires either velocity reduction or thicker wall piping before work order release.",
        citations: ["ASME B31.3-2024 Section 304.1.2"],
      },
      optimization_proposal: {
        requires_optimization: true,
        current_reynolds: 3120,
        target_reynolds: 4000,
        suggested_changes: {
          angle_degrees: 25,
          diameter_inch: 5.5,
          material_upgrade: null,
        },
        predicted_new_reynolds: 4210,
        efficiency_gain_percent: 12,
        cost_impact: "medium",
        reasoning:
          "Decreasing blade pitch from 35 deg to 25 deg increases velocity by 8%. Pairing with a modest diameter reduction preserves pressure drop while moving into turbulent regime. Material already meets ASTM A790 so upgrade unnecessary.",
      },
      final_recommendation: "IMPLEMENT_OPTIMIZATION",
      summary:
        "Adopt the blade pitch + diameter adjustment to meet turbulence and B31.3 pressure margins. Requires supervisor approval before ERP execution.",
    },
    glass_box_trace: [
      {
        step: 1,
        agent: "Vision Extractor (GPT-4o)",
        status: "completed",
        description: "Blueprint parsed, geometry + material pulled.",
        detail: "Confidence medium due to partial occlusion on blueprint corner.",
        timestamp: "2026-01-22T18:13:30.002Z",
      },
      {
        step: 2,
        agent: "Perplexity Researcher",
        status: "completed",
        description: "Standards cross-referenced with duplex stainless spec.",
        detail: "Focused on ASTM A790/A790M, ASME B31.3, ISO 14001.",
        timestamp: "2026-01-22T18:13:58.114Z",
      },
      {
        step: 3,
        agent: "Design Optimizer (GPT-4o)",
        status: "completed",
        description: "Evaluated Reynolds + compliance gap.",
        detail: "Flagged need for blade pitch change prior to ERP WO.",
        timestamp: "2026-01-22T18:14:37.215Z",
      },
    ],
  },
};
