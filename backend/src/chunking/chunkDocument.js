const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

function fallbackTokenize(text) {
  return text.match(/\S+\s*/g) || [];
}

function tensorToArray(value) {
  if (value && typeof value.tolist === 'function') return tensorToArray(value.tolist());
  if (Array.isArray(value)) return value.flatMap((item) => tensorToArray(item));
  if (typeof value === 'bigint') return [Number(value)];
  return value === undefined || value === null ? [] : [value];
}

function tokenPieces(text, tokenizer) {
  if (!tokenizer) return fallbackTokenize(text);
  try {
    const encoded = typeof tokenizer === 'function'
      ? tokenizer(text, { add_special_tokens: false })
      : tokenizer.encode(text, { add_special_tokens: false });
    if (Array.isArray(encoded)) return tensorToArray(encoded);
    if (encoded?.ids) return tensorToArray(encoded.ids);
    if (encoded?.input_ids) return tensorToArray(encoded.input_ids);
  } catch {
    // A tokenizer implementation is optional in unit tests; use a stable fallback.
  }
  return fallbackTokenize(text);
}

function tokenCount(text, tokenizer) {
  return tokenPieces(text, tokenizer).length;
}

function overlapText(text, maxTokens, tokenizer) {
  const words = text.split(/\s+/).filter(Boolean);
  const selected = [];
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const candidate = [words[index], ...selected].join(' ');
    if (tokenCount(candidate, tokenizer) > maxTokens) break;
    selected.unshift(words[index]);
  }
  return selected.join(' ');
}

function splitOversizedWord(word, maxTokens, tokenizer, chunk) {
  const pieces = [];
  let fragment = '';
  for (const character of word) {
    const candidate = fragment + character;
    if (fragment && tokenCount(candidate, tokenizer) > maxTokens) {
      pieces.push({ ...chunk, content: fragment, tokenCount: tokenCount(fragment, tokenizer) });
      fragment = character;
    } else {
      fragment = candidate;
    }
  }
  if (fragment) pieces.push({ ...chunk, content: fragment, tokenCount: tokenCount(fragment, tokenizer) });
  return pieces;
}

function splitSentences(text) {
  const sentences = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];
    if (!'.!?'.includes(character)) continue;
    // A period inside a version, URL, filename, or identifier is content, not
    // sentence punctuation. Only split at punctuation that terminates a
    // sentence (followed by whitespace or the end of the text).
    if (nextCharacter && !/\s/.test(nextCharacter)) continue;
    const sentence = text.slice(start, index + 1).trim();
    if (sentence) sentences.push(sentence);
    start = index + 1;
  }
  const remainder = text.slice(start).trim();
  if (remainder) sentences.push(remainder);
  return sentences.length ? sentences : [text.trim()];
}

function splitToTokenLimit(text, maxTokens, tokenizer) {
  const units = splitSentences(text);
  const chunks = [];
  let current = [];
  let count = 0;
  for (const unit of units) {
    const unitCount = tokenCount(unit, tokenizer);
    if (current.length && count + unitCount > maxTokens) {
      chunks.push(current.join(' '));
      current = [];
      count = 0;
    }
    if (unitCount > maxTokens) {
      const words = unit.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i += maxTokens) chunks.push(words.slice(i, i + maxTokens).join(' '));
      continue;
    }
    current.push(unit);
    count += unitCount;
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks.filter(Boolean);
}

export function chunkDocument(text, {
  maxTokens = 200,
  overlapTokens = 30,
  tokenizer,
  source = 'document'
} = {}) {
  const sections = String(text || '').split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  const result = [];
  let heading = '';
  for (const section of sections) {
    const lines = section.split('\n');
    const headingMatch = HEADING_PATTERN.exec(lines[0]);
    if (headingMatch) {
      heading = headingMatch[2].trim();
      lines.shift();
    }
    const body = lines.join(' ').trim();
    if (!body) continue;
    const parts = splitToTokenLimit(body, maxTokens, tokenizer);
    for (const part of parts) {
      const content = heading ? `${heading}\n${part}` : part;
      result.push({
        id: `${source}:${result.length}`,
        content,
        section: heading || undefined,
        tokenCount: tokenCount(content, tokenizer)
      });
    }
  }
  // Carry a small sentence/word overlap between adjacent chunks without allowing
  // heading metadata to be duplicated as content.
  for (let i = 1; i < result.length && overlapTokens > 0; i += 1) {
    const overlap = overlapText(result[i - 1].content, overlapTokens, tokenizer);
    if (overlap) {
      const currentBody = result[i].content.split('\n').at(-1);
      result[i].content = `${result[i].section ? `${result[i].section}\n` : ''}${overlap} ${currentBody}`.trim();
      result[i].tokenCount = tokenCount(result[i].content, tokenizer);
    }
  }
  const finalChunks = result.flatMap((chunk) => {
    if (chunk.tokenCount <= maxTokens) return [chunk];
    const words = chunk.content.split(/\s+/).filter(Boolean);
    const pieces = [];
    let current = [];
    for (const word of words) {
      if (!current.length && tokenCount(word, tokenizer) > maxTokens) {
        pieces.push(...splitOversizedWord(word, maxTokens, tokenizer, chunk));
        continue;
      }
      const candidate = [...current, word].join(' ');
      if (current.length && tokenCount(candidate, tokenizer) > maxTokens) {
        const currentContent = current.join(' ');
        pieces.push({ ...chunk, content: currentContent, tokenCount: tokenCount(currentContent, tokenizer) });
        const overlap = overlapText(current.join(' '), overlapTokens, tokenizer).split(/\s+/).filter(Boolean);
        current = [...overlap, word];
        while (current.length > 1 && tokenCount(current.join(' '), tokenizer) > maxTokens) current.shift();
        if (tokenCount(current.join(' '), tokenizer) > maxTokens) {
          pieces.push(...splitOversizedWord(word, maxTokens, tokenizer, chunk));
          current = [];
        }
      } else {
        current.push(word);
      }
    }
    if (current.length) {
      const content = current.join(' ');
      pieces.push({ ...chunk, content, tokenCount: tokenCount(content, tokenizer) });
    }
    return pieces;
  });
  if (finalChunks.some((chunk) => chunk.tokenCount > maxTokens)) {
    throw new Error(`Chunker produced a chunk larger than ${maxTokens} tokens.`);
  }
  return finalChunks;
}

export { tokenCount };
