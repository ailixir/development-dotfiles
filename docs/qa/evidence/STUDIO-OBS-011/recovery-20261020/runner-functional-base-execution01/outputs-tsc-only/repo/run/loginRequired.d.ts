/** Trusted structural signature, never a text heuristic or a new failure trigger. */
export declare function loginRequiredSignature(observation: {
    readonly coverage: {
        readonly passwordControls: number;
    };
    readonly nodes: readonly {
        readonly visible: boolean;
        readonly actionable: boolean;
        readonly elementType: string;
        readonly role: string;
    }[];
}): boolean;
