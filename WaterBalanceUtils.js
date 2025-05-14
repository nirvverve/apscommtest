import { goldenNumbers } from './config.js';
import { advancedLSI } from './script.js';

// Color classes for each parameter
const PARAM_COLORS = {
  cya: 'cya-purple',
  alkalinity: 'alk-green',
  calcium: 'calcium-blue',
  ph: 'ph-red'
};

// Card background classes for each parameter (matches styles.css)
const PARAM_CARD_CLASS = {
  cya: 'chem-card cya',
  alkalinity: 'chem-card alk',
  calcium: 'chem-card ch',
  ph: 'chem-card ph',
  acid: 'chem-card acid',
  sodaash: 'chem-card ph'
};

// --- Helper Functions for Dose Calculations ---

// Estimate pH rise from sodium bicarbonate dose
function estimatePhRiseFromBicarb(alkalinityIncrease) {
  // Empirical: ~0.03 pH units per 10 ppm increase
  return (alkalinityIncrease / 10) * 0.03;
}

// Estimate pH drop from cyanuric acid dose
function estimatePhDropFromCya(cyaIncrease) {
  // Empirical: ~0.07 pH units per 10 ppm increase
  return (cyaIncrease / 10) * 0.07;
}

// Sodium bicarbonate dose (to raise alkalinity)
function alkalinityDose(current, target, gallons) {
  if (target <= current) return null;
  // 1.5 lbs sodium bicarb per 10,000 gal raises TA by 10 ppm
  const doseLbs = ((target - current) / 10) * 1.5 * (gallons / 10000);
  return doseLbs > 0
    ? `${doseLbs.toFixed(2)} lbs sodium bicarbonate`
    : null;
}

// Calcium chloride dose (to raise calcium hardness)
function calciumDose(current, target, gallons) {
  if (target <= current) return null;
  // 1.25 lbs calcium chloride per 10,000 gal raises CH by 10 ppm
  const doseLbs = ((target - current) / 10) * 1.25 * (gallons / 10000);
  return doseLbs > 0
    ? `${doseLbs.toFixed(2)} lbs calcium chloride`
    : null;
}

// Cyanuric acid dose (to raise CYA)
function cyaDose(current, target, gallons) {
  if (target <= current) return null;
  // 13 oz stabilizer per 10,000 gal raises CYA by 10 ppm
  const doseOz = ((target - current) / 10) * 13 * (gallons / 10000);
  return doseOz > 16
    ? `${(doseOz / 16).toFixed(2)} lbs (${doseOz.toFixed(1)} oz) stabilizer`
    : `${doseOz.toFixed(1)} oz stabilizer`;
}

// Acid dose to lower pH
function acidDose(current, target, gallons, alkalinity) {
  // if (current <= target) return null;
  // PoolFactor and AlkFactor are simplified for demo purposes
  //const poolFactor = 76 * (gallons / 10000);
  //const alkFactor = alkalinity / 100;
  //const acidFlOz = (current - target) * poolFactor * alkFactor;
  //if (acidFlOz <= 0) return null;
  //if (acidFlOz < 128) {
  // return `${acidFlOz.toFixed(1)} fl oz muriatic acid`;
  // } else {
  //  return `${(acidFlOz / 128).toFixed(2)} gal (${acidFlOz.toFixed(1)} fl oz) muriatic acid`;
 // }
//
return acidDoseToLowerPh(current, target, gallons, alkalinity);
}

function acidDoseToLowerPh(currentPh, targetPh, gallons, alkalinity) {
  if (currentPh <= targetPh) return null;
  const pHdrop = currentPh - targetPh;
  // 1.3 fl oz per 0.1 pH drop per 10,000 gal at TA 100
  const acidFlOz = 1.3 * (alkalinity / 100) * (pHdrop / 0.1) * (gallons / 10000);
  if (acidFlOz <= 0) return null;
  if (acidFlOz < 128) {
    return `${acidFlOz.toFixed(1)} fl oz muriatic acid (31.45%)`;
  } else {
    return `${(acidFlOz / 128).toFixed(2)} gal (${acidFlOz.toFixed(1)} fl oz) muriatic acid (31.45%)`;
  }
}

// Soda ash dose to raise pH
function sodaAshDose(current, target, gallons, alkalinity) {
  if (current >= target) return null;
  const diff = target - current;
  if (diff <= 0) return null;
  const ounces = (diff / 0.2) * 6 * (gallons / 10000);
  if (ounces <= 0) return null;
  if (ounces > 16) {
    return `${(ounces / 16).toFixed(2)} lbs (${ounces.toFixed(1)} oz) soda ash`;
  } else {
    return `${ounces.toFixed(1)} oz soda ash`;
  }
}

// ... rest of code remains same

function acidDoseForAlk(currentAlk, targetAlk, gallons) {
  if (currentAlk <= targetAlk) return null;
  const ppmDrop = currentAlk - targetAlk;
  // Orenda: 0.2 gal per 10,000 gal per 10 ppm drop (31.45% muriatic acid)
  const gallonsAcid = (ppmDrop / 10) * 0.2 * (gallons / 10000);
  const flOz = gallonsAcid * 128;
  if (gallonsAcid < 0.01) return null;
  if (gallonsAcid < 1) {
    return `${flOz.toFixed(1)} fl oz muriatic acid.`;
  } else {
    return `${gallonsAcid.toFixed(2)} gal (${flOz.toFixed(1)} fl oz) muriatic acid.`;
  }
}

// ... rest of code remains same

function splitAcidDose(totalDose, days) {
  if (!totalDose) return null;
  return `Add 1/${days} of total dose (${totalDose}) per day for ${days} days`;
}
// --- Main Water Balance Steps Function ---

/**
 * Calculate water balance steps to reach golden numbers (or custom targets).
 * Returns { steps, notes }.
 */
function getWaterBalanceSteps({
  poolType = 'pool',
  poolVolume = 10000,
  current = { cya: 0, alkalinity: 0, calcium: 0, ph: 7.5 },
  targets = {},
  tempF = 77,
  tds = 1000
}) {
  // Example golden numbers (replace with your config.js import if needed)
  let t = { ...goldenNumbers[poolType], ...targets };
  let notes = [];

  // Order: Alkalinity, Calcium, CYA, pH
  const steps = [];

   // --- Super High Alkalinity/Calcium Logic ---
   const superHighAlk = current.alkalinity > 180;
   const superHighCa = current.calcium > 600;
   const highCa = current.calcium > 400;
   // Calculate LSI for current water
   const lsi = advancedLSI({
    ph: current.ph,
    tempF: tempF,
    calcium: current.calcium,
    alkalinity: current.alkalinity,
    cya: current.cya !== undefined ? current.cya : 0,
    tds: tds !== undefined ? tds : 1000
   });
 
   // If super high alk and not super high calcium, prioritize alk
   if (superHighAlk && current.calcium < 500) {
     // Calculate total acid needed to bring alk to 120
     const totalAcidDose = acidDoseForAlk(current.alkalinity, 100, poolVolume);
     // Split over 3 days
     const perDayDose = splitAcidDose(totalAcidDose, 3);
     steps.push({
       key: 'alkalinity',
       parameter: 'Total Alkalinity',
       current: current.alkalinity,
       target: 100,
       dose: perDayDose,
       note: 'Alkalinity is extremely high. Lower alkalinity in stages over 3 days before adjusting other parameters.'
     });
     notes.push('Alkalinity is extremely high. Lower alkalinity in stages over 3 days before adjusting other parameters.');
     // Defer all other adjustments
     return { steps, notes };
   }
 
   // If super high calcium, lower pH target for LSI
   if (superHighCa || (superHighAlk && highCa)) {
     t.ph = 7.2; // or 7.3, based on your preference
     notes.push('Calcium is extremely high. Lower pH target to 7.2 for LSI balance.');
   }
 
   // If LSI > 0.5, show warning and prioritize alk/pH
   if (
    lsi > 0.5 &&
    ((current.alkalinity > t.alkalinity) || (current.ph > t.ph))
  ) {
    notes.push('LSI is in extreme scaling condition (>0.5). Prioritize lowering alkalinity and pH.');
  }

  // --- Alkalinity Step ---
  let alkDose = alkalinityDose(current.alkalinity, t.alkalinity, poolVolume);
  let anticipatedPh = current.ph;
  let anticipatedPhNote = null;
  let anticipatedAcidDose = null;
  let anticipatedSodaAshDoseAfterAlk = null;

  if (alkDose) {
    // Calculate anticipated pH rise from sodium bicarbonate
    const alkIncrease = t.alkalinity - current.alkalinity;
    const phRise = estimatePhRiseFromBicarb(alkIncrease);
    anticipatedPh = +(current.ph + phRise).toFixed(2);

    // If anticipated pH is above target, recommend acid dose
    if (anticipatedPh > t.ph) {
      anticipatedAcidDose = acidDose(anticipatedPh, t.ph, poolVolume, t.alkalinity);
      anticipatedPhNote = `Note: Adding sodium bicarbonate to raise alkalinity by ${alkIncrease} ppm is expected to raise pH from ${current.ph} to approximately ${anticipatedPh}. After the bicarb is fully dispersed (wait 30 minutes), test pH and add acid as needed to bring pH down to ${t.ph}. Recommended acid dose: ${anticipatedAcidDose}.`;
      notes.push(anticipatedPhNote);
    } else {
      anticipatedPhNote = `Note: Adding sodium bicarbonate to raise alkalinity by ${alkIncrease} ppm is expected to raise pH from ${current.ph} to approximately ${anticipatedPh}.`;
      notes.push(anticipatedPhNote);
    }

    // If anticipated pH is below target, recommend soda ash dose
    if (anticipatedPh < t.ph) {
      anticipatedSodaAshDoseAfterAlk = sodaAshDose(anticipatedPh, t.ph, poolVolume, t.alkalinity);
    }
  }

  steps.push({
    key: 'alkalinity',
    parameter: 'Total Alkalinity',
    current: current.alkalinity,
    target: t.alkalinity,
    dose: alkDose,
    anticipatedPh: alkDose ? anticipatedPh : null,
    anticipatedAcidDose: anticipatedAcidDose,
    anticipatedSodaAshDoseAfterAlk
  });

  // --- Calcium Hardness Step ---
  steps.push({
    key: 'calcium',
    parameter: 'Calcium Hardness',
    current: current.calcium,
    target: t.calcium,
    dose: calciumDose(current.calcium, t.calcium, poolVolume)
  });

  // --- CYA Step ---
  let cyaStepDose = cyaDose(current.cya, t.cya, poolVolume);
  let anticipatedPhAfterCya = anticipatedPh;
  let cyaPhNote = null;
  let cyaSodaAshDose = null;

  if (cyaStepDose) {
    // Calculate anticipated pH drop from cyanuric acid
    const cyaIncrease = t.cya - current.cya;
    const phDrop = estimatePhDropFromCya(cyaIncrease);
    anticipatedPhAfterCya = +(anticipatedPh - phDrop).toFixed(2);

    // If anticipated pH after CYA is below target, recommend soda ash dose
    if (anticipatedPhAfterCya < t.ph) {
      cyaSodaAshDose = sodaAshDose(anticipatedPhAfterCya, t.ph, poolVolume, t.alkalinity);
      cyaPhNote = `Note: Adding cyanuric acid to raise CYA by ${cyaIncrease} ppm is expected to lower pH from ${anticipatedPh} to approximately ${anticipatedPhAfterCya}. After the CYA is fully dispersed (wait 30 minutes), test pH and add soda ash as needed to bring pH up to ${t.ph}. Recommended soda ash dose: ${cyaSodaAshDose}.`;
      notes.push(cyaPhNote);
    } else {
      cyaPhNote = `Note: Adding cyanuric acid to raise CYA by ${cyaIncrease} ppm is expected to lower pH from ${anticipatedPh} to approximately ${anticipatedPhAfterCya}.`;
      notes.push(cyaPhNote);
    }
  }

  steps.push({
    key: 'cya',
    parameter: 'Cyanuric Acid',
    current: current.cya,
    target: t.cya,
    dose: cyaStepDose,
    anticipatedPh: cyaStepDose ? anticipatedPhAfterCya : null,
    anticipatedSodaAshDose: cyaSodaAshDose
  });

  // --- pH Step (can be up or down) ---
  let phDose = null;
  if (current.ph > t.ph) {
    phDose = acidDose(current.ph, t.ph, poolVolume, current.alkalinity);
  } else if (current.ph < t.ph) {
    phDose = sodaAshDose(current.ph, t.ph, poolVolume, current.alkalinity);
  }
  steps.push({
    key: 'ph',
    parameter: 'pH',
    current: current.ph,
    target: t.ph,
    dose: phDose
  });

  return { steps, notes };
}

// --- Display Functions ---
function renderTodayDosageCards({
  poolType,
  poolVolume,
  current,
  targets = {},
  tempF = 77,
  tds = 1000,
  freeChlorine,
  totalChlorine,
  chlorineType,
  doseTableHTML,
  BreakpointChlorinationHTML
}) {
  const { steps, notes } = getWaterBalanceSteps({ poolType, poolVolume, current, targets, tempF, tds });

  // --- Water Balance Section ---
  // Find the first water balance step that needs adjustment (alkalinity, cya, calcium)
  const firstWaterBalanceStep = steps.find(
    step => (step.current < step.target || step.current > step.target) && step.dose &&
    (['alkalinity', 'cya', 'calcium'].includes(step.key))
  );
  // Find all other water balance steps that need adjustment (excluding the first)
  const otherWaterBalanceSteps = steps.filter(
    step =>
      (step.current < step.target || step.current > step.target) &&
      step.dose &&
      (['alkalinity', 'cya', 'calcium'].includes(step.key)) &&
      step !== firstWaterBalanceStep
  );
  // Find the pH step that needs adjustment
  const phStep = steps.find(step => step.key === 'ph' && step.dose);

  // Water Balance Cards
  let waterBalanceCards = '';
  if (firstWaterBalanceStep) {
    function formatCumulativeEffect(step) {
      let effect = '';
      if (step.key === 'alkalinity' && step.dose) {
        const direction = step.target > step.current ? 'raise' : 'lower';
        effect = `to ${direction} alkalinity from ${step.current} ppm to ${step.target} ppm.`;
      } else if (step.key === 'calcium' && step.dose) {
        effect = `to raise calcium hardness from ${step.current} ppm to ${step.target} ppm.`;
      } else if (step.key === 'cya' && step.dose) {
        effect = `to raise cyanuric acid from ${step.current} ppm to ${step.target} ppm.`;
      }
      return effect ? ` ${effect}` : '';
    }
    waterBalanceCards = `
      <div class="${PARAM_CARD_CLASS[firstWaterBalanceStep.key] || 'chem-card'}">
        <strong>${firstWaterBalanceStep.parameter}:</strong>
        <div style="margin:0.5em 0 0.2em 0;">
          ${firstWaterBalanceStep.dose}
          ${formatCumulativeEffect(firstWaterBalanceStep)}
        </div>
      </div>
    `;
  }

  // pH Adjustment Cards
  let pHAdjustmentCards = '';
  if (firstWaterBalanceStep) {
    // Acid after alkalinity
    if (firstWaterBalanceStep.key === 'alkalinity' && firstWaterBalanceStep.anticipatedAcidDose) {
      const anticipatedPh = firstWaterBalanceStep.anticipatedPh;
      pHAdjustmentCards += `
        <div class="${PARAM_CARD_CLASS['acid']}">
          <strong>pH Adjustment (Acid):</strong>
          <div style="margin:0.5em 0 0.2em 0;">
            ${firstWaterBalanceStep.anticipatedAcidDose}
            to lower pH from ${anticipatedPh} to ${steps.find(s => s.key === 'ph').target}.
          </div>
          <div style="font-style:italic; color:#b71c1c; margin-top:0.5em;">
            Wait 15 - 30 minutes to adjust pH after adding sodium bicarbonate.
          </div>
        </div>
      `;
    }
    // Soda ash after alkalinity
    if (firstWaterBalanceStep.key === 'alkalinity' && firstWaterBalanceStep.anticipatedSodaAshDoseAfterAlk) {
      const anticipatedPh = firstWaterBalanceStep.anticipatedPh;
      pHAdjustmentCards += `
        <div class="${PARAM_CARD_CLASS['sodaash']}">
          <strong>pH Adjustment (Soda Ash):</strong>
          <div style="margin:0.5em 0 0.2em 0;">
            ${firstWaterBalanceStep.anticipatedSodaAshDoseAfterAlk}
            to raise pH from ${anticipatedPh} to ${steps.find(s => s.key === 'ph').target}.
          </div>
          <div style="font-style:italic; color:#b71c1c; margin-top:0.5em;">
            Wait 15 - 30 minutes before adjusting pH after adding sodium bicarbonate.
          </div>
        </div>
      `;
    }
    // Acid/soda ash after calcium
    if (firstWaterBalanceStep.key === 'calcium') {
      if (phStep && phStep.dose && phStep.current > phStep.target) {
        pHAdjustmentCards += `
          <div class="${PARAM_CARD_CLASS['acid']}">
            <strong>pH Adjustment (Acid):</strong>
            <div style="margin:0.5em 0 0.2em 0;">
              ${phStep.dose}
              to lower pH from ${phStep.current} to ${phStep.target}.
            </div>
            <div style="font-style:italic; color:#b71c1c; margin-top:0.5em;">
              Wait 15 - 30 minutes before adjusting pH after adding calcium chloride.
            </div>
          </div>
        `;
      }
      if (phStep && phStep.dose && phStep.current < phStep.target) {
        pHAdjustmentCards += `
          <div class="${PARAM_CARD_CLASS['sodaash']}">
            <strong>pH Adjustment (Soda Ash):</strong>
            <div style="margin:0.5em 0 0.2em 0;">
              ${phStep.dose}
              to raise pH from ${phStep.current} to ${phStep.target}.
            </div>
            <div style="font-style:italic; color:#b71c1c; margin-top:0.5em;">
              Wait 15 - 30 minutes before adjusting pH after adding calcium chloride.
            </div>
          </div>
        `;
      }
    }
    // Soda ash after CYA
    if (firstWaterBalanceStep.key === 'cya' && firstWaterBalanceStep.anticipatedSodaAshDose) {
      const anticipatedPh = firstWaterBalanceStep.anticipatedPh;
      pHAdjustmentCards += `
        <div class="${PARAM_CARD_CLASS['sodaash']}">
          <strong>pH Adjustment (Soda Ash):</strong>
          <div style="margin:0.5em 0 0.2em 0;">
            ${firstWaterBalanceStep.anticipatedSodaAshDose}
            to raise pH from ${anticipatedPh} to ${steps.find(s => s.key === 'ph').target}.
          </div>
          <div style="font-style:italic; color:#b71c1c; margin-top:0.5em;">
            Wait 15 - 30 minutes before adjusting pH after adding cyanuric acid.
          </div>
        </div>
      `;
    }
  }
  // pH adjustment card if only pH is out of range
  if (!firstWaterBalanceStep && phStep) {
    // Acid dose
    if (phStep.dose && phStep.current > phStep.target) {
      pHAdjustmentCards += `
        <div class="${PARAM_CARD_CLASS['acid']}">
          <strong>pH Adjustment (Acid):</strong>
          <div style="margin:0.5em 0 0.2em 0;">
            ${phStep.dose}
            to lower pH from ${phStep.current} to ${phStep.target}.
          </div>
        </div>
      `;
    }
    // Soda ash dose
    if (phStep.dose && phStep.current < phStep.target) {
      pHAdjustmentCards += `
        <div class="${PARAM_CARD_CLASS['sodaash']}">
          <strong>pH Adjustment (Soda Ash):</strong>
          <div style="margin:0.5em 0 0.2em 0;">
            ${phStep.dose}
            to raise pH from ${phStep.current} to ${phStep.target}.
          </div>
        </div>
      `;
    }
  }

  // Note for other parameters
  let otherParamsNote = '';
  if (otherWaterBalanceSteps.length > 0) {
    const paramNames = otherWaterBalanceSteps.map(step => step.parameter).join(', ');
    otherParamsNote = `
      <div style="margin-top:1em;">
        <em>Other parameters (${paramNames}) should be adjusted in subsequent visits. See "Is My Pool Balanced?" for more detail.</em>
      </div>
    `;
  }

  // --- Manual Chlorine Dosing / Shocking Section ---
  // Show the chlorine dose table and Breakpoint card (with dose written out)
  let manualChlorineSection = '';
  const combinedChlorine = typeof totalChlorine === 'number' && typeof freeChlorine === 'number'
    ? totalChlorine - freeChlorine
    : 0;

  if (doseTableHTML || BreakpointChlorinationHTML) {
    let BreakpointDoseText = '';
    if (BreakpointChlorinationHTML) {
      const match = BreakpointChlorinationHTML.match(/<span class="breakpoint-dose">([^<]+)<\/span>/);
      if (match) {
        BreakpointDoseText = match[1];
      }
    }
    manualChlorineSection = `
      <div class="manual-chlorine-section">
        <h4>Manual Chlorine Dosing / Shocking</h4>
        ${doseTableHTML ? `<div class="chlorine-dose-table">${doseTableHTML}</div>` : ''}
        ${
          (combinedChlorine > 0.6 && BreakpointChlorinationHTML) ? `
          <div class="chem-card fac" style="background:#fffde7;">
            <strong>Shock Needed:</strong>
            <div style="margin:0.5em 0 0.2em 0;">
              Combined chlorine is above 0.6 ppm.${BreakpointDoseText ? ` Add <strong>${BreakpointDoseText}</strong> to achieve breakpoint chlorination.` : ''}<br>
              <em>Consult "Does My Pool Need To Be Shocked?" for details.</em>
            </div>
          </div>
        ` : ''
        }
      </div>
    `;
  }

  // If nothing to add, show a message
  if (!firstWaterBalanceStep && !phStep && !manualChlorineSection) {
    return `
      <details class="today-dosage-details" open>
        <summary><strong>What Should I Add to the Pool Today?</strong></summary>
        <div style="margin:1em 0;">
          <em>All parameters are within target range. No chemical additions needed today.</em>
        </div>
      </details>
    `;
  }

  return `
    <details class="today-dosage-details" open>
      <summary><strong>What Should I Add to the Pool Today?</strong></summary>
      <div style="margin:1em 0;">
        <h4>Water Balance:</h4>
        ${waterBalanceCards}
        ${pHAdjustmentCards}
        ${otherParamsNote}
        ${manualChlorineSection}
      </div>
    </details>
  `;
}

function renderWaterBalanceSteps({ poolType, poolVolume, current, targets = {}, tempF = 77, tds = 1000 }) {
  const { steps, notes } = getWaterBalanceSteps({ poolType, poolVolume, current, targets, tempF, tds });

  // Color classes for table rows
  const PARAM_COLORS = {
    cya: 'cya-purple',
    alkalinity: 'alk-green',
    calcium: 'calcium-blue',
    ph: 'ph-red'
  };

  // Only include water balance steps for alkalinity, calcium, and cya (exclude pH)
  const filteredSteps = steps.filter(step =>
    ['alkalinity', 'calcium', 'cya'].includes(step.key)
  );

  // Determine which parameters are out of range for the summary
  const outOfRangeSteps = filteredSteps.filter(step => {
    return step.current < step.target || step.current > step.target;
  });

  // Water Balance Plan Summary
  const planSummary = outOfRangeSteps.length
    ? `<div class="water-balance-plan-summary" style="margin-bottom:1em;">
    <strong>Water Balance Plan Summary:</strong><br>
    Adjust the following parameters in this order, one per day:<br>
    <ol>
    ${outOfRangeSteps.map((step, idx) =>
    `<li>Day ${idx + 1}: <span class="${PARAM_COLORS[step.key]}">${step.parameter}</span></li>`
    ).join('')}
    </ol>
    </div>`
    : `<div class="water-balance-plan-summary" style="margin-bottom:1em;">
    <strong>Water Balance Plan Summary:</strong> All parameters are within target range.
    </div>`;

  // Table with color classes, excluding pH
  return `
    <style>
    .cya-purple { color: #8e24aa; font-weight: bold; }
    .alk-green { color: #388e3c; font-weight: bold; }
    .calcium-blue { color: #1976d2; font-weight: bold; }
    .ph-red { color: #d32f2f; font-weight: bold; }
    .dose-table tr.cya-purple td, .dose-table tr.cya-purple th { background: #f3e5f5; }
    .dose-table tr.alk-green td, .dose-table tr.alk-green th { background: #e8f5e9; }
    .dose-table tr.calcium-blue td, .dose-table tr.calcium-blue th { background: #e3f2fd; }
    .dose-table tr.ph-red td, .dose-table tr.ph-red th { background: #ffebee; }
    </style>
    <div class="section water-balance-steps">
    <h3>Water Balance Adjustment Steps</h3>
    ${planSummary}
    <table class="dose-table">
    <thead>
    <tr>
    <th>Order</th>
    <th>Parameter</th>
    <th>Current</th>
    <th>Target</th>
    <th>Dose Needed</th>
    </tr>
    </thead>
    <tbody>
    ${filteredSteps.map((step, idx) => `
    <tr class="${PARAM_COLORS[step.key] || ''}">
    <td>${idx + 1}</td>
    <td><span class="${PARAM_COLORS[step.key] || ''}">${step.parameter}</span></td>
    <td>${step.current !== undefined && step.current !== null ? step.current : '-'}</td>
    <td>${step.target !== undefined && step.target !== null ? step.target : '-'}</td>
    <td>${step.dose ? `<span class="dose">${step.dose}</span>` : '<em>None needed</em>'}</td>
    </tr>
    `).join('')}
    </tbody>
    </table>
    ${notes && notes.length > 0 ? `
    <div class="water-balance-notes" style="margin-top:1em;color:#b71c1c;">
    <strong>Note:</strong>
    <ul>
    ${notes.map(n => `<li>${n}</li>`).join('')}
    </ul>
    </div>
    ` : ''}
    <div style="margin-top:0.7em;font-size:0.98em;color:#757575;">
    <em>Adjust chemicals in the order shown above for best results.  Adjust one parameter per day, preferably before the pool opens or right after it closes.</em>
    </div>
    </div>
  `;
}

export { renderTodayDosageCards, renderWaterBalanceSteps, getWaterBalanceSteps };