-- Test Data for Document Retrieval Phase 3
-- Sample pharmaceutical documents with diverse content for testing all retrieval scenarios

-- Insert test documents
INSERT INTO PUBLIC.DOCUMENTS (
  DOCUMENT_ID, CONTENT_HASH, FILE_NAME, FILE_TYPE, FILE_SIZE_BYTES,
  FULL_TEXT, PAGES_COUNT, TEXT_DENSITY, PARSING_METHOD,
  UPLOAD_USER_ID, STATUS
)
VALUES
  (
    'doc-clinical-001',
    'hash-clinical-trial-2025',
    'Clinical_Trial_Results_2025.pdf',
    'pdf',
    45000,
    'CLINICAL TRIAL RESULTS 2025 - CARDIOVASCULAR DISEASE TREATMENT\n\n' ||
    'This comprehensive clinical trial evaluated the efficacy and safety of compound XR-2847 in treating hypertension and heart failure. ' ||
    'Over 2000 patients participated in this 52-week randomized controlled trial conducted across 15 research centers. ' ||
    'Primary endpoints showed a 34% reduction in blood pressure compared to placebo (p<0.001). ' ||
    'Secondary endpoints demonstrated improved cardiac output by 28% with sustained response through week 52. ' ||
    'Adverse events were minimal with only 12% reporting mild headaches. No serious cardiac events attributed to treatment.',
    8,
    0.18,
    'pdfmupdf',
    'test-user',
    'indexed'
  ),
  (
    'doc-safety-001',
    'hash-safety-alert-2025',
    'FDA_Safety_Alert_Cardiac.pdf',
    'pdf',
    32000,
    'FDA SAFETY ALERT - CARDIAC SAFETY CONCERNS\n\n' ||
    'The FDA has issued a warning regarding potential QT prolongation risk with certain antiarrhythmic medications. ' ||
    'Post-marketing surveillance data from 50,000 patient records identified elevated risk in patients over 65 years old. ' ||
    'Risk of torsades de pointes increased 2.3-fold when combined with CYP3A4 inhibitors like ketoconazole. ' ||
    'Healthcare providers should avoid use in patients with existing QT prolongation or electrolyte abnormalities. ' ||
    'Patients currently on these medications require baseline and quarterly ECG monitoring. ' ||
    'Recommended alternative therapies are listed in appendix with comparable efficacy profiles.',
    6,
    0.19,
    'pdfmupdf',
    'test-user',
    'indexed'
  ),
  (
    'doc-interaction-001',
    'hash-drug-interactions-complete',
    'Comprehensive_Drug_Interaction_Guide.pdf',
    'pdf',
    67000,
    'COMPREHENSIVE DRUG INTERACTION GUIDE - 2025 EDITION\n\n' ||
    'This guide documents major and minor drug interactions affecting pharmaceutical efficacy and safety. ' ||
    'CRITICAL INTERACTIONS: Warfarin + NSAIDs increases bleeding risk 5-fold through protein binding displacement. ' ||
    'Methotrexate + NSAIDs causes renal failure by reducing glomerular filtration rate. ' ||
    'ACE inhibitors + potassium supplements lead to hyperkalemia requiring regular monitoring. ' ||
    'MODERATE INTERACTIONS: Statins + clarithromycin increases myopathy risk through CYP3A4 inhibition. ' ||
    'Oral contraceptives + rifampin reduces effectiveness through enzyme induction. ' ||
    'MINOR INTERACTIONS: Antacids may reduce absorption of fluoroquinolones but timing mitigation possible. ' ||
    'Complete interaction matrix with severity, mechanism, and management recommendations provided in appendix.',
    12,
    0.21,
    'pdfmupdf',
    'test-user',
    'indexed'
  ),
  (
    'doc-market-001',
    'hash-market-analysis-oncology',
    'Oncology_Market_Analysis_H1_2025.docx',
    'docx',
    28000,
    'ONCOLOGY MARKET ANALYSIS - H1 2025 REPORT\n\n' ||
    'The global oncology market reached $187 billion in the first half of 2025, growing 8.3% year-over-year. ' ||
    'Immuno-oncology treatments dominate with 42% market share, led by checkpoint inhibitors and CAR-T therapies. ' ||
    'Targeted therapy segment grew 12% driven by precision medicine approaches for lung cancer and melanoma. ' ||
    'Key products: Pembrolizumab (Merck) leads checkpoint space with $8.2B sales; Opdivo (Bristol) at $7.1B. ' ||
    'Emerging competitors targeting PD-L1 variants showing 15-20% response improvements in clinical data. ' ||
    'Regulatory approvals accelerated with 23 new molecular entities approved vs 18 in H1 2024. ' ||
    'Pipeline analysis indicates 47 oncology drugs in phase 3 trials, particularly strong in combination therapies.',
    7,
    0.20,
    'pdfmupdf',
    'test-user',
    'indexed'
  ),
  (
    'doc-regulatory-001',
    'hash-fda-guidance-quality',
    'FDA_Guidance_Manufacturing_Quality.pdf',
    'pdf',
    41000,
    'FDA GUIDANCE FOR INDUSTRY - PHARMACEUTICAL QUALITY STANDARDS\n\n' ||
    'Current Good Manufacturing Practice (cGMP) requirements for pharmaceutical manufacturing require strict adherence. ' ||
    'Quality by Design (QbD) approach emphasizes understanding product and process characteristics. ' ||
    'Critical process parameters must be controlled within validated ranges to ensure batch consistency. ' ||
    'Stability testing requirements: long-term at 25C/60% RH for 36 months, intermediate at 30C/75% RH for 12 months. ' ||
    'Analytical method validation requires demonstration of specificity, linearity, accuracy, precision, and robustness. ' ||
    'Microbial limits testing must comply with USP <2023> standards for aerobic and anaerobic bacteria detection. ' ||
    'Change control procedures mandatory for any manufacturing process modifications affecting product quality.',
    9,
    0.19,
    'pdfmupdf',
    'test-user',
    'indexed'
  ),
  (
    'doc-research-001',
    'hash-receptor-pharmacology-mechanism',
    'G_Protein_Coupled_Receptor_Pharmacology.pdf',
    'pdf',
    55000,
    'G-PROTEIN COUPLED RECEPTOR PHARMACOLOGY AND MECHANISM OF ACTION\n\n' ||
    'G-protein coupled receptors (GPCRs) represent the largest family of cell surface receptors with 7 transmembrane domains. ' ||
    'Ligand binding causes conformational change activating heterotrimeric G-proteins (Gs, Gi/o, Gq/11, G12/13). ' ||
    'Signal transduction pathways: Gs stimulates adenylyl cyclase increasing cAMP; Gi inhibits adenylyl cyclase. ' ||
    'Beta-adrenergic receptors via Gs activation increase heart rate and contractility through cAMP-PKA pathway. ' ||
    'Muscarinic M1 receptors via Gq activation increase phospholipase C activity releasing IP3 and DAG. ' ||
    'Antagonist drug development targets these pathways: beta-blockers inhibit Gs signaling in cardiac tissue. ' ||
    'Selective agonists and allosteric modulators represent new therapeutic strategies for GPCR-based diseases.',
    11,
    0.22,
    'pdfmupdf',
    'test-user',
    'indexed'
  );

-- Insert document chunks with comprehensive content covering all scenarios
INSERT INTO PUBLIC.DOCUMENT_CHUNKS (
  DOCUMENT_ID, CHUNK_TEXT, CHUNK_INDEX, PAGE_NUMBER, SECTION_LABEL, EMBEDDING, EMBEDDING_MODEL, CONTEXT_BEFORE, CONTEXT_AFTER
)
VALUES
  -- Clinical Trial Chunks
  (
    'doc-clinical-001', 1,
    'CLINICAL TRIAL RESULTS: PRIMARY ENDPOINT ANALYSIS\n\n' ||
    'The primary efficacy endpoint measured change in systolic blood pressure from baseline to week 52. ' ||
    'Treatment group showed mean reduction of 34 mmHg (SD 12) compared to placebo reduction of 8 mmHg (SD 11). ' ||
    'This difference of 26 mmHg was statistically significant (p<0.001, 95% CI 23-29). ' ||
    'Secondary efficacy endpoints: diastolic blood pressure reduced 18 mmHg vs 4 mmHg placebo (p<0.001). ' ||
    'Heart failure hospitalization reduced by 31% with compound XR-2847 vs placebo group. ' ||
    'Mortality reduction showed 22% lower all-cause mortality in treatment group (HR 0.78, 95% CI 0.65-0.94).',
    2, 'Clinical Efficacy Results', NULL, 'pdfmupdf',
    'CLINICAL TRIAL RESULTS 2025', 'Secondary endpoints demonstrated'
  ),
  (
    'doc-clinical-001', 2,
    'SAFETY AND ADVERSE EVENTS PROFILE\n\n' ||
    'Treatment emergent adverse events occurred in 67% of treatment group vs 61% of placebo group. ' ||
    'Most common adverse events were mild headaches (12%), dizziness (8%), and fatigue (6%). ' ||
    'No serious adverse events attributed to drug treatment in either group. ' ||
    'No cases of angioedema, hepatotoxicity, or hematologic abnormalities detected. ' ||
    'Discontinuation due to adverse events: 4.2% treatment vs 3.1% placebo (not statistically different). ' ||
    'QT interval prolongation >60 ms observed in 0.3% of treatment group with no arrhythmias. ' ||
    'Long-term safety data through 24-month extension confirms sustained safety profile.',
    3, 'Safety Analysis', NULL, 'pdfmupdf',
    'Heart failure hospitalization reduced', 'Long-term safety'
  ),
  (
    'doc-clinical-001', 3,
    'PATIENT DEMOGRAPHICS AND SUBGROUP ANALYSIS\n\n' ||
    'Study enrolled 2047 patients: 1023 treatment, 1024 placebo (age 18-85 years, mean 62.3). ' ||
    'Gender distribution: 52% male, 48% female; 68% Caucasian, 18% African American, 14% Hispanic. ' ||
    'Subgroup analyses showed efficacy across all age groups and genders with consistent response. ' ||
    'Elderly subgroup (>65 years, n=892) showed similar efficacy but required dose reduction in 23%. ' ||
    'Renal impairment subgroup: eGFR 30-59 mL/min showed efficacy but with 18% increased adverse event rate. ' ||
    'Hepatic impairment subgroup excluded due to safety concerns in preclinical studies. ' ||
    'Concomitant antihypertensive therapy present in 78% of enrolled patients with additive effects.',
    4, 'Subgroup Analysis', NULL, 'pdfmupdf',
    'Long-term safety data', 'PATIENT DEMOGRAPHICS'
  ),

  -- Safety Alert Chunks
  (
    'doc-safety-001', 1,
    'FDA SAFETY ALERT: QT PROLONGATION AND ARRHYTHMIA RISK\n\n' ||
    'Post-marketing surveillance identified cases of torsades de pointes in 0.8% of patients using antiarrhythmic class IA drugs. ' ||
    'Risk factors: age >65 years, female gender, electrolyte abnormalities (hypokalemia, hypomagnesemia), bradycardia. ' ||
    'Drug-drug interactions increase risk: CYP3A4 inhibitors (ketoconazole, verapamil, amiodarone) elevate plasma levels 2-3 fold. ' ||
    'FDA recommends baseline ECG assessment before initiation and periodic monitoring during treatment. ' ||
    'Concurrent use with other QT-prolonging agents (fluoroquinolones, macrolides) contraindicated. ' ||
    'Electrolyte panel required at baseline and quarterly: potassium >3.5 mEq/L, magnesium >2.0 mg/dL mandatory. ' ||
    'Patient counseling required regarding signs of arrhythmia: palpitations, dizziness, syncope, chest discomfort.',
    2, 'QT Prolongation Hazard', NULL, 'pdfmupdf',
    'FDA SAFETY ALERT', 'Risk factors identified'
  ),
  (
    'doc-safety-001', 2,
    'RISK MITIGATION STRATEGIES AND ALTERNATIVE THERAPIES\n\n' ||
    'For patients requiring cardiac rate control, alternatives to class IA antiarrhythmics include: ' ||
    'Beta-blockers (metoprolol, atenolol): Effective for SVT and AFib control, class I indication, safer QT profile. ' ||
    'Non-dihydropyridine calcium channel blockers (verapamil, diltiazem): Effective for rate control, comparable efficacy. ' ||
    'Digoxin: Limited use due to narrow therapeutic window but useful in heart failure with AFib. ' ||
    'Class II agents recommended as first-line therapy for most arrhythmias with lower risk profile. ' ||
    'If class IA agents necessary: Start lowest effective dose (procainamide 1.25g/day, quinidine 200mg/dose). ' ||
    'Mandatory ECG monitoring before each dose increase and 2 hours post-initiation. ' ||
    'Patient education on drug-drug interactions and strict compliance with monitoring requirements essential.',
    3, 'Alternative Therapies', NULL, 'pdfmupdf',
    'Concurrent use contraindicated', 'Patient counseling requirements'
  ),

  -- Drug Interactions Chunks
  (
    'doc-interaction-001', 1,
    'WARFARIN-NSAID INTERACTION: BLEEDING RISK MECHANISM\n\n' ||
    'Warfarin anticoagulant effect: Inhibits vitamin K-dependent clotting factors (II, VII, IX, X). ' ||
    'NSAIDs inhibit platelet aggregation through COX-1 inhibition and reduce gastric cytoprotection. ' ||
    'Mechanism of interaction: Protein binding displacement - NSAIDs displace warfarin from plasma proteins (99% bound). ' ||
    'Free warfarin concentration increases 2-3 fold, enhancing anticoagulant effect disproportionately. ' ||
    'Gastrointestinal risk: NSAIDs inhibit prostaglandin-mediated gastric cytoprotection causing mucosal erosion. ' ||
    'Combined effect results in 5-fold increase in major bleeding events (GI hemorrhage, intracranial, other sites). ' ||
    'Clinical management: Use alternative analgesic (acetaminophen preferred); if NSAID necessary, use lowest dose shortest duration. ' ||
    'INR monitoring required within 3-5 days of NSAID initiation and weekly for 2 weeks. ' ||
    'Proton pump inhibitor recommended to reduce GI bleeding risk if NSAID must be used.',
    2, 'Critical Interactions', NULL, 'pdfmupdf',
    'COMPREHENSIVE DRUG INTERACTION', 'Warfarin anticoagulant'
  ),
  (
    'doc-interaction-001', 2,
    'METHOTREXATE-NSAID INTERACTION: RENAL FAILURE MECHANISM\n\n' ||
    'Methotrexate elimination: 85-90% renal excretion via glomerular filtration and active tubular secretion. ' ||
    'NSAIDs mechanism: Inhibit prostaglandin synthesis reducing renal blood flow and glomerular filtration rate (GFR). ' ||
    'Prostaglandins maintain afferent arteriolar vasodilation essential for renal perfusion and function. ' ||
    'Interaction result: NSAIDs decrease GFR by 20-40%, reducing methotrexate clearance significantly. ' ||
    'Methotrexate accumulation leads to toxicity: bone marrow suppression, nephrotoxicity, hepatotoxicity. ' ||
    'Acute renal failure can occur within days, particularly with high-dose methotrexate (>1g). ' ||
    'Clinical management: AVOID all NSAIDs in methotrexate patients; use acetaminophen for pain control. ' ||
    'Baseline renal function (creatinine, GFR) required before methotrexate initiation. ' ||
    'Monitor renal function weekly for first month, then monthly; maintain hydration status vigilantly.',
    3, 'Renal-Compromising Interactions', NULL, 'pdfmupdf',
    'Critical Interactions', 'NSAIDs inhibit'
  ),
  (
    'doc-interaction-001', 3,
    'ACE INHIBITOR-POTASSIUM SUPPLEMENT INTERACTION: HYPERKALEMIA\n\n' ||
    'ACE inhibitors mechanism: Block angiotensin II formation reducing aldosterone synthesis. ' ||
    'Aldosterone role: Promotes renal sodium reabsorption and potassium excretion in collecting duct. ' ||
    'ACE inhibitor effect: Decreased aldosterone reduces potassium excretion leading to retention. ' ||
    'Potassium supplement addition exacerbates hyperkalemia risk exponentially. ' ||
    'Hyperkalemia definition: Serum potassium >5.5 mEq/L (normal 3.5-5.0); levels >6.0 risk cardiac arrhythmias. ' ||
    'Cardiac effects of hyperkalemia: peaked T waves, prolonged PR interval, wide QRS complex, ventricular fibrillation risk. ' ||
    'Populations at high risk: renal disease, diabetes, NSAIDs concurrent use, elderly patients. ' ||
    'Clinical management: Avoid potassium supplements; dietary potassium restriction to <2g/day recommended. ' ||
    'Monitor serum potassium: baseline, 1 week, 1 month after initiation, then every 3-6 months. ' ||
    'If levels >5.5 mEq/L: Reduce ACE inhibitor dose or substitute alternative antihypertensive (different mechanism).',
    4, 'Electrolyte Interactions', NULL, 'pdfmupdf',
    'Renal-Compromising', 'Hyperkalemia risk'
  ),

  -- Market Analysis Chunks
  (
    'doc-market-001', 1,
    'GLOBAL ONCOLOGY MARKET SIZE AND GROWTH TRENDS 2025\n\n' ||
    'Market reached $187 billion in H1 2025, representing 8.3% year-over-year growth from $172.6 billion H1 2024. ' ||
    'Growth drivers: Aging population increasing cancer incidence, improved survival extending treatment duration, ' ||
    'new therapeutic modalities (CAR-T, bispecific antibodies, ADCs), and expanded geographic access. ' ||
    'Regional breakdown: North America $73B (39%), Europe $51B (27%), Asia-Pacific $52B (28%), Rest of World $11B (6%). ' ||
    'Segment growth rates: Immuno-oncology +12%, Targeted Therapy +12%, Conventional Chemotherapy +2%, Immunotherapy +15%. ' ||
    'Top 5 pharmaceutical markets driving oncology: United States, China, Japan, Germany, France (72% of global market). ' ||
    'Emerging markets (India, Brazil, Mexico) showing 15-20% CAGR as healthcare access improves.',
    2, 'Market Overview', NULL, 'pdfmupdf',
    'ONCOLOGY MARKET ANALYSIS', 'Growth drivers'
  ),
  (
    'doc-market-001', 2,
    'LEADING ONCOLOGY PRODUCTS AND COMPETITIVE LANDSCAPE\n\n' ||
    'Top 10 oncology products account for 34% of global market ($63.6 billion in annual sales). ' ||
    'Product rankings by sales:\n' ||
    '1. Pembrolizumab (Merck) - $8.2B: PD-1 inhibitor, indication expansion to 35+ cancers\n' ||
    '2. Opdivo (Bristol Myers Squibb) - $7.1B: PD-1 inhibitor, strong lung cancer franchise\n' ||
    '3. Keytruda (Merck) - $6.9B: Anti-PD-L1, leading checkpoint inhibitor globally\n' ||
    '4. Herceptin (Roche) - $6.5B: HER2 targeted monoclonal antibody, breast cancer standard\n' ||
    '5. Avastin (Roche) - $6.2B: VEGF inhibitor, broad cancer applications\n' ||
    '6. Revlimid (Bristol Myers Squibb) - $5.8B: IMiD immunomodulator, multiple myeloma\n' ||
    '7. Imbruvica (AbbVie) - $5.4B: BTK inhibitor, chronic lymphocytic leukemia/lymphoma\n' ||
    '8. Tecentriq (Roche) - $5.1B: PD-L1 inhibitor, lung and bladder cancer\n' ||
    '9. Rituxan (Roche) - $4.9B: CD20 inhibitor, lymphomas and autoimmune\n' ||
    '10. Velcade (Takeda) - $4.3B: Proteasome inhibitor, multiple myeloma backbone\n' ||
    'Patent cliff approaching: 12 major products losing exclusivity 2025-2027, creating $18B biosimilar opportunity.',
    3, 'Competitive Products', NULL, 'pdfmupdf',
    'Market Size', 'Patent cliff'
  );

-- Note: Embeddings will be generated when documents are retrieved via Snowflake Cortex EMBED_TEXT_768
-- Sample chunks have been inserted; embeddings NULL initially, populated during retrieval ingestion

COMMIT;
