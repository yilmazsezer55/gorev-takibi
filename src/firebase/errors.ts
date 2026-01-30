export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

export class FirestorePermissionError extends Error {
  public context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    const message = `FirestoreError: Missing or insufficient permissions. The following request was denied by Firestore Security Rules:\n${JSON.stringify(context, null, 2)}`;
    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;

    // This is to make the error readable in the Next.js error overlay
    if (typeof (this as any).toJSON === 'undefined') {
        (this as any).toJSON = () => {
            return {
                name: this.name,
                message: this.message,
                stack: this.stack,
                context: this.context,
            };
        };
    }
  }
}
