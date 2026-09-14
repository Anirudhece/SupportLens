const LABEL_FIELDS = ['product', 'documentType', 'documentVersion'];
const MAX_LABEL_LENGTH = 120;

function invalid(message) {
  const error = new Error(message);
  error.code = 'invalid_metadata';
  return error;
}

export function normalizeMetadataLabels(input = {}, { allowUnknown = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('metadata labels must be an object.');
  if (!allowUnknown) {
    const unknown = Object.keys(input).filter((key) => !LABEL_FIELDS.includes(key));
    if (unknown.length) throw invalid(`Unknown metadata field: ${unknown[0]}.`);
  }
  const labels = {};
  for (const field of LABEL_FIELDS) {
    if (!Object.hasOwn(input, field)) continue;
    if (typeof input[field] !== 'string') throw invalid(`${field} must be a non-empty string.`);
    const value = input[field].trim();
    if (!value || value.length > MAX_LABEL_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
      throw invalid(`${field} must be 1-${MAX_LABEL_LENGTH} characters without control characters.`);
    }
    labels[field] = value;
  }
  return labels;
}

export { LABEL_FIELDS };
