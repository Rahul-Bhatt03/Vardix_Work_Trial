# Free Dental Care Under 19

The pipeline now resolves `free_care_under_19` for every clinic. The field is
a nullable boolean: `true` or `false` when a source makes an explicit claim,
otherwise `null`. Each observation includes its source URL, confidence,
retrieval time, evidence text, and extraction method. Conflicting source
values are retained and marked through the standard field conflict contract.

The website and 1177 extractors recognize Swedish claims such as “fri
tandvård för barn och unga”, “fri/gratis barntandvård”, and explicit adult-only
statements. Ordinary mentions of children’s dentistry are not treated as proof
of free care.

The gold set contains two verified labels: Abbas Dental (`false`) and Alviks
Strand (`true`). Evaluation reports precision and recall for this field in
`output/eval-report.json`. The current checked-in report is based on output
from before both positive clinics were successfully reprocessed, so it reports
`TP=0`, `FP=1`, `FN=2`, precision `0`, and recall `0`. A fresh complete
network-backed pipeline run is required for a current live-data score.