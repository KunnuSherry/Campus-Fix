import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

interface FormattedTextProps {
  content: string;
  baseStyle?: any;
}

/**
 * Beautiful, non-AI-slop renderer for LLM responses.
 * Parses markdown tables, bold spans (**text**), bullet points, and headings
 * into polished native components.
 */
export const FormattedText: React.FC<FormattedTextProps> = ({ content, baseStyle }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let inTable = false;

  const renderTable = (rows: string[][], key: string) => {
    if (rows.length === 0) return null;
    const header = rows[0];
    const dataRows = rows.slice(1).filter((r) => !r.every((c) => c.match(/^[-:]+$/)));

    return (
      <View key={key} style={styles.tableContainer}>
        {/* Header */}
        <View style={styles.tableHeaderRow}>
          {header.map((col, idx) => (
            <View key={idx} style={[styles.tableCell, { flex: idx === 0 ? 1.4 : 1 }]}>
              <Text style={styles.tableHeaderText}>{col.trim()}</Text>
            </View>
          ))}
        </View>
        {/* Data Rows */}
        {dataRows.map((row, rIdx) => (
          <View
            key={rIdx}
            style={[
              styles.tableRow,
              rIdx % 2 === 1 && { backgroundColor: '#f8fafc' },
            ]}
          >
            {row.map((col, cIdx) => (
              <View key={cIdx} style={[styles.tableCell, { flex: cIdx === 0 ? 1.4 : 1 }]}>
                <Text style={styles.tableCellText}>{col.trim()}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  const parseInlineBold = (text: string, keyPrefix: string) => {
    // Splits text by **bold** markers
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return (
      <Text key={keyPrefix} style={[styles.bodyText, baseStyle]}>
        {parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <Text key={pIdx} style={styles.boldText}>
                {part.slice(2, -2)}
              </Text>
            );
          }
          return part;
        })}
      </Text>
    );
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Check if line is part of a markdown table (starts and ends with |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      const columns = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      // Skip separator row like |---|---|
      if (!columns.every((c) => c.match(/^[-:]+$/))) {
        tableRows.push(columns);
      }
      return;
    } else if (inTable) {
      // End of table
      elements.push(renderTable(tableRows, `table_${index}`));
      tableRows = [];
      inTable = false;
    }

    if (!trimmed) {
      elements.push(<View key={`sp_${index}`} style={{ height: 6 }} />);
      return;
    }

    // Section Headings (### or ##)
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const headingText = trimmed.replace(/^#+\s*/, '');
      elements.push(
        <View key={`h_${index}`} style={styles.headingContainer}>
          <Text style={styles.headingText}>{headingText}</Text>
        </View>
      );
      return;
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      const bulletContent = trimmed.replace(/^[-*•]\s*/, '');
      elements.push(
        <View key={`b_${index}`} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <View style={{ flex: 1 }}>{parseInlineBold(bulletContent, `bp_${index}`)}</View>
        </View>
      );
      return;
    }

    // Numbered lists (1. , 2. )
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      elements.push(
        <View key={`num_${index}`} style={styles.bulletRow}>
          <Text style={styles.numPrefix}>{numMatch[1]}.</Text>
          <View style={{ flex: 1 }}>{parseInlineBold(numMatch[2], `nump_${index}`)}</View>
        </View>
      );
      return;
    }

    // Regular paragraph text
    elements.push(
      <View key={`p_${index}`} style={{ marginVertical: 2 }}>
        {parseInlineBold(trimmed, `txt_${index}`)}
      </View>
    );
  });

  if (inTable && tableRows.length > 0) {
    elements.push(renderTable(tableRows, `table_end`));
  }

  return <View style={styles.container}>{elements}</View>;
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  bodyText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 21,
  },
  boldText: {
    fontWeight: '700',
    color: Colors.text,
  },
  headingContainer: {
    marginTop: 10,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 4,
  },
  headingText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 3,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 16,
    color: Colors.primary,
    marginRight: 8,
    lineHeight: 20,
  },
  numPrefix: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
    marginRight: 6,
    lineHeight: 20,
  },
  // Table styling
  tableContainer: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: 8,
    backgroundColor: '#ffffff',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableCell: {
    paddingHorizontal: 4,
  },
  tableCellText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
  },
});

