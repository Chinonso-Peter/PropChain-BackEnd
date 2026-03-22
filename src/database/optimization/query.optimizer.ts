import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Query Optimization Service
 *
 * Provides database query optimization and performance monitoring capabilities
 */
@Injectable()
export class QueryOptimizerService {
  private readonly logger = new Logger(QueryOptimizerService.name);
  private queryStats = new Map<string, QueryStats>();
  private slowQueryThreshold: number;

  constructor(private readonly configService: ConfigService) {
    this.slowQueryThreshold = this.configService.get<number>('SLOW_QUERY_THRESHOLD', 1000);
  }

  /**
   * Analyze and optimize query
   */
  analyzeQuery(query: string, params?: any[]): QueryAnalysis {
    const analysis: QueryAnalysis = {
      query,
      params,
      executionTime: 0,
      recommendations: [],
      complexity: this.calculateQueryComplexity(query),
      indexes: this.suggestIndexes(query),
      optimizations: this.suggestOptimizations(query),
    };

    return analysis;
  }

  /**
   * Track query performance
   */
  trackQuery(query: string, executionTime: number, rowCount?: number): void {
    const queryHash = this.hashQuery(query);
    const existing = this.queryStats.get(queryHash);

    if (existing) {
      existing.count++;
      existing.totalTime += executionTime;
      existing.averageTime = existing.totalTime / existing.count;
      existing.maxTime = Math.max(existing.maxTime, executionTime);
      existing.minTime = Math.min(existing.minTime, executionTime);
      existing.lastExecuted = new Date();
      if (rowCount !== undefined) {
        existing.rowCount = rowCount;
      }
    } else {
      this.queryStats.set(queryHash, {
        query,
        count: 1,
        totalTime: executionTime,
        averageTime: executionTime,
        maxTime: executionTime,
        minTime: executionTime,
        firstExecuted: new Date(),
        lastExecuted: new Date(),
        rowCount,
      });
    }

    // Log slow queries
    if (executionTime > this.slowQueryThreshold) {
      this.logger.warn(`Slow query detected (${executionTime}ms): ${query.substring(0, 200)}...`);
    }
  }

  /**
   * Get query statistics
   */
  getQueryStats(): QueryStats[] {
    return Array.from(this.queryStats.values()).sort((a, b) => b.averageTime - a.averageTime);
  }

  /**
   * Get slow queries
   */
  getSlowQueries(): QueryStats[] {
    return this.getQueryStats().filter(stats => stats.averageTime > this.slowQueryThreshold);
  }

  /**
   * Get most frequent queries
   */
  getMostFrequentQueries(limit: number = 10): QueryStats[] {
    return this.getQueryStats()
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Calculate query complexity score
   */
  private calculateQueryComplexity(query: string): number {
    let complexity = 0;
    const upperQuery = query.toUpperCase();

    // Joins increase complexity
    const joinCount = (upperQuery.match(/JOIN/g) || []).length;
    complexity += joinCount * 2;

    // Subqueries increase complexity
    const subqueryCount = (upperQuery.match(/SELECT.*FROM.*SELECT/g) || []).length;
    complexity += subqueryCount * 3;

    // Aggregates increase complexity
    const aggregateCount = (upperQuery.match(/(COUNT|SUM|AVG|MIN|MAX)\(/g) || []).length;
    complexity += aggregateCount;

    // WHERE clauses increase complexity
    const whereCount = (upperQuery.match(/WHERE/g) || []).length;
    complexity += whereCount;

    // ORDER BY increases complexity
    const orderByCount = (upperQuery.match(/ORDER BY/g) || []).length;
    complexity += orderByCount;

    // GROUP BY increases complexity
    const groupByCount = (upperQuery.match(/GROUP BY/g) || []).length;
    complexity += groupByCount * 2;

    return complexity;
  }

  /**
   * Suggest indexes for query optimization
   */
  private suggestIndexes(query: string): IndexSuggestion[] {
    const suggestions: IndexSuggestion[] = [];
    const upperQuery = query.toUpperCase();

    // Extract WHERE conditions
    const whereMatch = upperQuery.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|$)/);
    if (whereMatch) {
      const whereClause = whereMatch[1];
      const columns = this.extractColumnsFromCondition(whereClause);

      for (const column of columns) {
        suggestions.push({
          column,
          type: 'btree',
          reason: 'Used in WHERE clause for filtering',
          priority: 'high',
        });
      }
    }

    // Extract ORDER BY columns
    const orderByMatch = upperQuery.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/);
    if (orderByMatch) {
      const orderByClause = orderByMatch[1];
      const columns = orderByClause.split(',').map(col => col.trim().split(' ')[0]);

      for (const column of columns) {
        suggestions.push({
          column,
          type: 'btree',
          reason: 'Used in ORDER BY for sorting',
          priority: 'medium',
        });
      }
    }

    // Extract JOIN conditions
    const joinMatches = upperQuery.match(/JOIN\s+.+?\s+ON\s+(.+?)(?:\s+JOIN|$)/g);
    if (joinMatches) {
      for (const joinMatch of joinMatches) {
        const onMatch = joinMatch.match(/ON\s+(.+?)(?:\s+JOIN|$)/);
        if (onMatch) {
          const onClause = onMatch[1];
          const columns = this.extractColumnsFromCondition(onClause);

          for (const column of columns) {
            suggestions.push({
              column,
              type: 'btree',
              reason: 'Used in JOIN condition',
              priority: 'high',
            });
          }
        }
      }
    }

    return this.removeDuplicateSuggestions(suggestions);
  }

  /**
   * Suggest query optimizations
   */
  private suggestOptimizations(query: string): string[] {
    const suggestions: string[] = [];
    const upperQuery = query.toUpperCase();

    // Check for SELECT *
    if (upperQuery.includes('SELECT *')) {
      suggestions.push('Avoid SELECT *. Specify only needed columns to reduce data transfer.');
    }

    // Check for missing LIMIT clauses
    if (!upperQuery.includes('LIMIT') && !upperQuery.includes('TOP')) {
      suggestions.push('Consider adding LIMIT clause to prevent large result sets.');
    }

    // Check for subqueries that could be JOINs
    if (upperQuery.includes('SELECT') && upperQuery.includes('FROM (SELECT')) {
      suggestions.push('Consider converting subqueries to JOINs for better performance.');
    }

    // Check for DISTINCT usage
    if (upperQuery.includes('DISTINCT')) {
      suggestions.push('DISTINCT can be expensive. Consider if GROUP BY would be more efficient.');
    }

    // Check for OR conditions
    if ((upperQuery.match(/\bOR\b/g) || []).length > 1) {
      suggestions.push('Multiple OR conditions can be slow. Consider using UNION or restructuring the query.');
    }

    // Check for LIKE with leading wildcard
    if (upperQuery.includes('LIKE %')) {
      suggestions.push('LIKE with leading wildcard (%) cannot use indexes effectively.');
    }

    return suggestions;
  }

  /**
   * Extract column names from SQL condition
   */
  private extractColumnsFromCondition(condition: string): string[] {
    const columns: string[] = [];

    // Match simple column references (table.column or column)
    const columnMatches = condition.match(/(\w+\.\w+|\w+)/g);

    if (columnMatches) {
      for (const match of columnMatches) {
        // Filter out SQL keywords and literals
        if (!this.isSqlKeyword(match) && !this.isLiteral(match)) {
          columns.push(match);
        }
      }
    }

    return columns;
  }

  /**
   * Check if string is a SQL keyword
   */
  private isSqlKeyword(word: string): boolean {
    const keywords = [
      'AND',
      'OR',
      'NOT',
      'IN',
      'LIKE',
      'BETWEEN',
      'IS',
      'NULL',
      'TRUE',
      'FALSE',
      'COUNT',
      'SUM',
      'AVG',
      'MIN',
      'MAX',
      'DISTINCT',
      'AS',
      'ON',
      'USING',
    ];
    return keywords.includes(word.toUpperCase());
  }

  /**
   * Check if string is a literal value
   */
  private isLiteral(word: string): boolean {
    return /^['"]|^\d+$/.test(word);
  }

  /**
   * Remove duplicate index suggestions
   */
  private removeDuplicateSuggestions(suggestions: IndexSuggestion[]): IndexSuggestion[] {
    const seen = new Set<string>();
    return suggestions.filter(suggestion => {
      const key = `${suggestion.column}-${suggestion.type}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Generate hash for query
   */
  private hashQuery(query: string): string {
    // Simple hash implementation - in production, use a proper hashing function
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Generate optimization report
   */
  generateOptimizationReport(): OptimizationReport {
    const stats = this.getQueryStats();
    const slowQueries = this.getSlowQueries();
    const frequentQueries = this.getMostFrequentQueries();

    return {
      totalQueries: stats.length,
      slowQueries: slowQueries.length,
      averageExecutionTime: stats.reduce((sum, stat) => sum + stat.averageTime, 0) / stats.length,
      topSlowQueries: slowQueries.slice(0, 10),
      topFrequentQueries: frequentQueries,
      recommendations: this.generateOverallRecommendations(stats),
      generatedAt: new Date(),
    };
  }

  /**
   * Generate overall recommendations
   */
  private generateOverallRecommendations(stats: QueryStats[]): string[] {
    const recommendations: string[] = [];

    if (stats.length === 0) {
      return ['No query data available for analysis'];
    }

    const avgTime = stats.reduce((sum, stat) => sum + stat.averageTime, 0) / stats.length;
    const slowCount = stats.filter(stat => stat.averageTime > this.slowQueryThreshold).length;

    if (avgTime > 500) {
      recommendations.push('Overall average query time is high. Consider database optimization.');
    }

    if (slowCount > stats.length * 0.1) {
      recommendations.push('High percentage of slow queries. Review query performance.');
    }

    const mostFrequent = stats.sort((a, b) => b.count - a.count)[0];
    if (mostFrequent && mostFrequent.count > 1000) {
      recommendations.push(
        `Query "${mostFrequent.query.substring(0, 50)}..." is executed frequently. Optimize this query.`,
      );
    }

    return recommendations;
  }

  /**
   * Clear query statistics
   */
  clearStats(): void {
    this.queryStats.clear();
    this.logger.log('Query statistics cleared');
  }
}

// Type definitions
export interface QueryStats {
  query: string;
  count: number;
  totalTime: number;
  averageTime: number;
  maxTime: number;
  minTime: number;
  firstExecuted: Date;
  lastExecuted: Date;
  rowCount?: number;
}

export interface QueryAnalysis {
  query: string;
  params?: any[];
  executionTime: number;
  recommendations: string[];
  complexity: number;
  indexes: IndexSuggestion[];
  optimizations: string[];
}

export interface IndexSuggestion {
  column: string;
  type: 'btree' | 'hash' | 'gist' | 'gin';
  reason: string;
  priority: 'low' | 'medium' | 'high';
}

export interface OptimizationReport {
  totalQueries: number;
  slowQueries: number;
  averageExecutionTime: number;
  topSlowQueries: QueryStats[];
  topFrequentQueries: QueryStats[];
  recommendations: string[];
  generatedAt: Date;
}
