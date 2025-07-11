export class ErrorHandler {
  static handle(error: unknown) {
    if (error instanceof InfrastructureError) {
      return {
        success: false,
        error: `[${error.code}] ${error.message}`,
      };
    }

    if (error instanceof Error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: "An unknown error occured.",
    };
  }
}

export class InfrastructureError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "InfrastructureError";
  }
}
