export function validateAnalysis(r, job) {
  const fail = () => {
    throw new Error('Invalid or inconsistent imagery receipt.');
  };
  if (
    !r ||
    r.algorithm !== 'paired-ndvi-v1' ||
    r.jobId !== job.id ||
    r.boundaryId !== job.boundaryId ||
    r.geometryCanonical !== job.geometryCanonical ||
    JSON.stringify(r.sceneIds) !== JSON.stringify(job.scenes.map((s) => s.id))
  )
    fail();
  const names = [
    'totalPixels',
    'pairedPixels',
    'beforeValidPixels',
    'afterValidPixels',
  ];
  for (const key of names)
    if (!Number.isSafeInteger(r[key]) || r[key] < 0 || r[key] > 4000000) fail();
  if (
    !r.totalPixels ||
    r.beforeValidPixels > r.totalPixels ||
    r.afterValidPixels > r.totalPixels ||
    r.pairedPixels > Math.min(r.beforeValidPixels, r.afterValidPixels) ||
    r.pairedPixels < r.beforeValidPixels + r.afterValidPixels - r.totalPixels
  )
    fail();
  const enough = r.pairedPixels >= 10 && r.pairedPixels / r.totalPixels >= 0.5;
  if (
    r.quality !==
      (enough ? 'sufficient_for_screening' : 'insufficient_coverage') ||
    JSON.stringify(r.maskClasses) !== '[4,5,6]'
  )
    fail();
  for (const key of ['beforeMean', 'afterMean', 'meanChange'])
    if (
      enough
        ? typeof r[key] !== 'number' || !Number.isFinite(r[key])
        : r[key] !== null
    )
      fail();
  if (
    enough &&
    (Math.abs(r.beforeMean) > 1 ||
      Math.abs(r.afterMean) > 1 ||
      Math.abs(r.meanChange - (r.afterMean - r.beforeMean)) > 1e-9)
  )
    fail();
  const signal = enough
    ? r.meanChange <= -0.1
      ? 'decrease_for_review'
      : 'no_decrease_flag'
    : 'unavailable';
  if (r.signal !== signal) fail();
  if (
    !/^[a-f0-9]{64}$/.test(r.processorSha256 ?? '') ||
    !Array.isArray(r.inputSha256) ||
    r.inputSha256.length !== 2
  )
    fail();
  for (const row of r.inputSha256)
    for (const key of ['red', 'nir', 'scl'])
      if (!/^[a-f0-9]{64}$/.test(row?.[key] ?? '')) fail();
  if (!Array.isArray(r.radiometry) || r.radiometry.length !== 2) fail();
  for (const row of r.radiometry)
    for (const key of ['red', 'nir'])
      if (
        !Number.isFinite(row?.[key]?.scale) ||
        row[key].scale <= 0 ||
        !Number.isFinite(row[key].offset)
      )
        fail();
  if (
    !r.runtime ||
    ['numpy', 'rasterio'].some(
      (k) => typeof r.runtime[k] !== 'string' || r.runtime[k].length > 40,
    )
  )
    fail();
  return {
    geometryCanonical: r.geometryCanonical,
    algorithm: r.algorithm,
    jobId: r.jobId,
    boundaryId: r.boundaryId,
    sceneIds: r.sceneIds,
    inputSha256: r.inputSha256,
    processorSha256: r.processorSha256,
    radiometry: r.radiometry,
    runtime: { numpy: r.runtime.numpy, rasterio: r.runtime.rasterio },
    totalPixels: r.totalPixels,
    pairedPixels: r.pairedPixels,
    beforeValidPixels: r.beforeValidPixels,
    afterValidPixels: r.afterValidPixels,
    beforeMean: r.beforeMean,
    afterMean: r.afterMean,
    meanChange: r.meanChange,
    quality: r.quality,
    signal,
    maskClasses: [4, 5, 6],
  };
}
