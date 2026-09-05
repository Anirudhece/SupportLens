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

function parseHeadingBlocks(text) {
  const sections = String(text || '').split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  let heading = '';
  return sections.map((section) => {
    const lines = section.split('\n');
    const headingMatch = HEADING_PATTERN.exec(lines[0]);
    if (headingMatch) {
      heading = headingMatch[2].trim();
      lines.shift();
    }
    return { heading, body: lines.join(' ').trim() };
  }).filter((section) => section.body);
}

function headingContent(heading, body, maxTokens, tokenizer) {
  if (!heading) return body;
  // Keep section metadata even when an unusually small experimental limit
  // cannot fit the heading beside any body content.
  if (maxTokens && tokenCount(heading, tokenizer) >= maxTokens) return body;
  return `${heading}\n${body}`;
}

function splitHeadingBody(heading, body, maxTokens, tokenizer) {
  const content = headingContent(heading, body, maxTokens, tokenizer);
  if (tokenCount(content, tokenizer) <= maxTokens) return [body];

  const words = body.split(/\s+/).filter(Boolean);
  const pieces = [];
  let current = [];
  for (const word of words) {
    const candidate = [...current, word].join(' ');
    if (!current.length && tokenCount(headingContent(heading, word, maxTokens, tokenizer), tokenizer) > maxTokens) {
      // A pathological long word still needs a bounded representation. The
      // heading remains available in metadata even when it cannot fit beside
      // the fragment in the configured limit.
      const available = Math.max(1, maxTokens - tokenCount(heading, tokenizer));
      pieces.push(...splitOversizedWord(word, available, tokenizer, { content: '' }).map((piece) => piece.content));
      continue;
    }
    if (current.length && tokenCount(headingContent(heading, candidate, maxTokens, tokenizer), tokenizer) > maxTokens) {
      pieces.push(current.join(' '));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) pieces.push(current.join(' '));
  return pieces.filter(Boolean);
}

function headingAwareChunks(text, maxTokens, overlapTokens, tokenizer, source) {
  const blocks = parseHeadingBlocks(text);
  const groups = [];
  for (const block of blocks) {
    const previous = groups.at(-1);
    if (!previous || previous.heading !== block.heading) groups.push({ heading: block.heading, blocks: [] });
    groups.at(-1).blocks.push(block.body);
  }

  const baseChunks = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const units = group.blocks.flatMap((body) => splitToTokenLimit(body, maxTokens, tokenizer));
    let current = '';
    for (const unit of units) {
      const candidate = current ? `${current} ${unit}` : unit;
      if (current && tokenCount(headingContent(group.heading, candidate, maxTokens, tokenizer), tokenizer) > maxTokens) {
        baseChunks.push({ heading: group.heading, body: current, groupIndex });
        current = unit;
      } else {
        current = candidate;
      }
    }
    if (current) baseChunks.push({ heading: group.heading, body: current, groupIndex });
  }

  const overlapped = baseChunks.map((chunk, index) => {
    let body = chunk.body;
    const previous = baseChunks[index - 1];
    if (previous && previous.groupIndex === chunk.groupIndex && overlapTokens > 0) {
      let overlapWords = overlapText(previous.body, overlapTokens, tokenizer).split(/\s+/).filter(Boolean);
      while (overlapWords.length && tokenCount(headingContent(chunk.heading, `${overlapWords.join(' ')} ${body}`, maxTokens, tokenizer), tokenizer) > maxTokens) {
        overlapWords.shift();
      }
      if (overlapWords.length) body = `${overlapWords.join(' ')} ${body}`;
    }
    return { ...chunk, body };
  });

  const finalChunks = overlapped.flatMap((chunk) => splitHeadingBody(chunk.heading, chunk.body, maxTokens, tokenizer).map((body) => ({
    id: `${source}:${baseChunks.indexOf(chunk)}`,
    content: headingContent(chunk.heading, body, maxTokens, tokenizer),
    section: chunk.heading || undefined,
    tokenCount: tokenCount(headingContent(chunk.heading, body, maxTokens, tokenizer), tokenizer),
    groupIndex: chunk.groupIndex
  })));
  if (finalChunks.some((chunk) => chunk.tokenCount > maxTokens)) {
    throw new Error(`Heading-aware chunker produced a chunk larger than ${maxTokens} tokens.`);
  }
  return finalChunks.map(({ groupIndex, ...chunk }, index) => ({ ...chunk, id: `${source}:${index}` }));
}

export function chunkDocument(text, {
  maxTokens = 200,
  overlapTokens = 30,
  tokenizer,
  source = 'document',
  strategy = 'recursive'
} = {}) {
  if (!['recursive', 'heading-aware'].includes(strategy)) {
    throw new Error(`Unknown chunking strategy: ${strategy}`);
  }
  if (strategy === 'heading-aware') return headingAwareChunks(text, maxTokens, overlapTokens, tokenizer, source);
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
    if (result[i - 1].section !== result[i].section) continue;
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
  return finalChunks.map((chunk, index) => ({ ...chunk, id: `${source}:${index}` }));
}

export function chunkingVersion({ strategy, maxTokens, overlapTokens }) {
  return `m2-${strategy}-${maxTokens}-${overlapTokens}`;
}

export { tokenCount };
