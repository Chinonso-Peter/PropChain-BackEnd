/**
 * Standard dependency injection patterns for PropChain Backend
 *
 * This file defines the standardized dependency injection patterns that all modules should follow
 * to ensure consistency and proper dependency management.
 */

export interface InjectionPattern {
  type: 'constructor' | 'property' | 'method';
  description: string;
  template: string;
  example: string;
  useCase: string;
}

/**
 * Standard dependency injection patterns
 */
export const STANDARD_INJECTION_PATTERNS: InjectionPattern[] = [
  {
    type: 'constructor',
    description: 'Constructor injection (preferred pattern)',
    template: 'constructor(private readonly serviceName: ServiceName) {}',
    example: `constructor(
  private readonly userService: UserService,
  private readonly configService: ConfigService,
  private readonly logger: Logger,
) {}`,
    useCase: 'Standard service dependencies',
  },
  {
    type: 'property',
    description: 'Property injection with @Inject decorator',
    template: '@Inject(SERVICE_TOKEN) private readonly serviceName: ServiceName',
    example: `@Inject(USER_SERVICE_TOKEN) 
private readonly userService: UserService;

@Inject(CONFIG_SERVICE_TOKEN)
private readonly configService: ConfigService;`,
    useCase: 'Custom token-based injection',
  },
  {
    type: 'method',
    description: 'Method parameter injection',
    template: 'methodName(@Inject(SERVICE_TOKEN) service: ServiceName)',
    example: `async createUser(
  @Body() createUserDto: CreateUserDto,
  @Inject(REQUEST) request: Request,
): Promise<User> {
  // Method implementation
}`,
    useCase: 'Request-scoped dependencies',
  },
];

/**
 * Repository injection patterns
 */
export const REPOSITORY_INJECTION_PATTERNS = {
  TYPEORM: {
    template: '@InjectRepository(Entity) private readonly repository: Repository<Entity>',
    example: `constructor(
  @InjectRepository(User)
  private readonly userRepository: Repository<User>,
  @InjectRepository(Property)
  private readonly propertyRepository: Repository<Property>,
) {}`,
    description: 'TypeORM repository injection',
  },
  CUSTOM: {
    template: 'constructor(private readonly customRepository: CustomRepository) {}',
    example: `constructor(
  private readonly userRepository: UserRepository,
  private readonly propertyRepository: PropertyRepository,
) {}`,
    description: 'Custom repository injection',
  },
};

/**
 * Service injection patterns
 */
export const SERVICE_INJECTION_PATTERNS = {
  BASIC: {
    template: 'constructor(private readonly serviceName: ServiceName) {}',
    example: `constructor(
  private readonly userService: UserService,
  private readonly emailService: EmailService,
  private readonly notificationService: NotificationService,
) {}`,
    description: 'Basic service dependencies',
  },
  CONFIGURED: {
    template:
      'constructor(private readonly serviceName: ServiceName, private readonly configService: ConfigService) {}',
    example: `constructor(
  private readonly blockchainService: BlockchainService,
  private readonly configService: ConfigService,
) {
  this.network = this.configService.get('BLOCKCHAIN_NETWORK', 'sepolia');
}`,
    description: 'Service with configuration dependency',
  },
  LAZY: {
    template: 'constructor(@Inject(forwardRef(() => ServiceName)) private readonly serviceName: ServiceName) {}',
    example: `constructor(
  @Inject(forwardRef(() => CircularService))
  private readonly circularService: CircularService,
) {}`,
    description: 'Forward reference for circular dependencies',
  },
};

/**
 * Guard and interceptor injection patterns
 */
export const GUARD_INTERCEPTOR_PATTERNS = {
  GUARD: {
    template: 'constructor(private readonly reflector: Reflector) {}',
    example: `constructor(
  private readonly reflector: Reflector,
  private readonly configService: ConfigService,
) {
  this.requiredRole = this.configService.get('REQUIRED_ROLE', 'user');
}`,
    description: 'Guard with reflection and configuration',
  },
  INTERCEPTOR: {
    template: 'constructor(private readonly logger: Logger) {}',
    example: `constructor(
  private readonly logger: Logger,
  private readonly configService: ConfigService,
) {
  this.logLevel = this.configService.get('LOG_LEVEL', 'info');
}`,
    description: 'Interceptor with logging and configuration',
  },
};

/**
 * Dependency injection utilities
 */
export class DIUtils {
  /**
   * Generate constructor injection code
   */
  static generateConstructorInjection(
    dependencies: Array<{
      name: string;
      type: string;
      isOptional?: boolean;
      token?: string;
    }>,
  ): string {
    const injections = dependencies.map(dep => {
      let injection = '';

      if (dep.isOptional) {
        injection += '@InjectOptional() ';
      }

      if (dep.token) {
        injection += `@Inject(${dep.token}) `;
      }

      injection += `private readonly ${dep.name}: ${dep.type}`;

      return injection;
    });

    return `constructor(\n  ${injections.join(',\n  ')}\n) {}`;
  }

  /**
   * Generate property injection code
   */
  static generatePropertyInjection(
    dependencies: Array<{
      name: string;
      type: string;
      token?: string;
    }>,
  ): string[] {
    return dependencies.map(dep => {
      let injection = '';

      if (dep.token) {
        injection += `@Inject(${dep.token}) `;
      }

      injection += `private readonly ${dep.name}: ${dep.type};`;

      return injection;
    });
  }

  /**
   * Validate dependency injection patterns
   */
  static validateInjectionPatterns(content: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for proper constructor injection
    if (content.includes('constructor(')) {
      // Check for readonly properties
      const constructorMatch = content.match(/constructor\(([^)]+)\)/);
      if (constructorMatch) {
        const params = constructorMatch[1];
        if (!params.includes('readonly')) {
          warnings.push('Constructor parameters should be readonly');
        }

        // Check for private properties
        if (!params.includes('private') && !params.includes('protected')) {
          warnings.push('Constructor parameters should be private or protected');
        }
      }
    }

    // Check for @Inject without @InjectOptional for optional dependencies
    const injectMatches = content.match(/@Inject\([^)]+\)/g);
    if (injectMatches) {
      for (const match of injectMatches) {
        if (!content.includes('@InjectOptional()') && match.includes('@Inject(')) {
          // Check if the parameter has optional type
          const nextLine = content.substring(content.indexOf(match)).split('\n')[1];
          if (nextLine && nextLine.includes('?')) {
            warnings.push('Optional dependency should use @InjectOptional()');
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Generate dependency injection tokens
   */
  static generateTokens(serviceName: string): {
    SERVICE_TOKEN: string;
    REPOSITORY_TOKEN: string;
    FACTORY_TOKEN: string;
  } {
    const upperName = serviceName.toUpperCase();

    return {
      SERVICE_TOKEN: `${upperName}_SERVICE_TOKEN`,
      REPOSITORY_TOKEN: `${upperName}_REPOSITORY_TOKEN`,
      FACTORY_TOKEN: `${upperName}_FACTORY_TOKEN`,
    };
  }

  /**
   * Generate provider configurations
   */
  static generateProviders(serviceName: string): string[] {
    const tokens = this.generateTokens(serviceName);
    const lowerName = serviceName.toLowerCase();

    return [
      `{
        provide: ${tokens.SERVICE_TOKEN},
        useClass: ${serviceName}Service,
      }`,
      `{
        provide: ${tokens.REPOSITORY_TOKEN},
        useClass: ${serviceName}Repository,
      }`,
      `${serviceName}Service`,
      `${serviceName}Repository`,
    ];
  }

  /**
   * Generate module providers configuration
   */
  static generateModuleProviders(serviceName: string): string {
    const providers = this.generateProviders(serviceName);

    return `providers: [
  ${providers.join(',\n  ')},
]`;
  }

  /**
   * Generate module exports configuration
   */
  static generateModuleExports(serviceName: string): string {
    const tokens = this.generateTokens(serviceName);

    return `exports: [
  ${serviceName}Service,
  ${serviceName}Repository,
  {
    provide: ${tokens.SERVICE_TOKEN},
    useClass: ${serviceName}Service,
  },
]`;
  }
}

/**
 * Circular dependency resolution utilities
 */
export class CircularDependencyUtils {
  /**
   * Generate forward reference injection
   */
  static generateForwardReference(dependencyName: string, dependencyType: string): string {
    return `@Inject(forwardRef(() => ${dependencyType}))
private readonly ${dependencyName.toLowerCase()}: ${dependencyType}`;
  }

  /**
   * Detect potential circular dependencies
   */
  static detectCircularDependencies(modulePath: string): {
    hasCircularDependency: boolean;
    circularPaths: string[];
  } {
    // This would implement actual circular dependency detection
    // For now, return placeholder
    return {
      hasCircularDependency: false,
      circularPaths: [],
    };
  }

  /**
   * Suggest solutions for circular dependencies
   */
  static suggestSolutions(circularPaths: string[]): string[] {
    const solutions: string[] = [];

    for (const path of circularPaths) {
      solutions.push(`Consider using forwardRef() for: ${path}`);
      solutions.push(`Extract common dependencies to a shared module`);
      solutions.push(`Use interfaces to break the circular dependency`);
    }

    return solutions;
  }
}

/**
 * Testing dependency injection utilities
 */
export class TestDIUtils {
  /**
   * Generate test module configuration
   */
  static generateTestModule(serviceName: string, dependencies: string[]): string {
    const mockProviders = dependencies.map(dep => `{ provide: ${dep}, useClass: Mock${dep} }`);

    return `Test.createTestingModule({
  providers: [
    ${serviceName}Service,
    ${mockProviders.join(',\n    ')},
  ],
})`;
  }

  /**
   * Generate mock service
   */
  static generateMockService(serviceName: string, methods: string[]): string {
    const methodMocks = methods.map(method => `${method}: jest.fn(),`);

    return `export class Mock${serviceName} {
  ${methodMocks.join('\n  ')}
}`;
  }

  /**
   * Generate unit test setup
   */
  static generateUnitTestSetup(serviceName: string, dependencies: string[]): string {
    const mockDeclarations = dependencies.map(dep => `let mock${dep}: Mock${dep};`).join('\n  ');

    const mockInstantiations = dependencies.map(dep => `mock${dep} = new Mock${dep}();`).join('\n    ');

    return `describe('${serviceName}Service', () => {
  let service: ${serviceName}Service;
  ${mockDeclarations}

  beforeEach(async () => {
    const module = Test.createTestingModule({
      providers: [
        ${serviceName}Service,
        ${dependencies.map(dep => `{ provide: ${dep}, useValue: mock${dep} }`).join(',\n        ')},
      ],
    }).compile();

    service = module.get<${serviceName}Service>(${serviceName}Service);
    ${mockInstantiations}
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});`;
  }
}
