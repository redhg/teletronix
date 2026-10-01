import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { createTimedReveal } from "../../engine/reveal/index.ts";
import { ActionSchema, ElementBaseShape, IdSchema } from "../../engine/schema/common.ts";
import { type Condition, ConditionSchema } from "../../engine/schema/variables.ts";

const LinesSchema = z
    .union([z.string(), z.array(z.string()).min(1)])
    .transform((text) => (Array.isArray(text) ? text : [text]))
    .meta({ description: "A line, or a list of lines" });

export const ReplySchema = z
    .strictObject({
        text: z.string().min(1).meta({ description: "What the player says" }),
        next: IdSchema.optional().meta({ description: "The part of the conversation it leads to" }),
        action: ActionSchema.optional().meta({
            description: "What happens when it's chosen, e.g. set a variable or go to a screen",
        }),
        if: ConditionSchema.optional().meta({ description: "Only offered while this holds" }),
        once: z.boolean().default(false).meta({
            description:
                "Only offered until it's been chosen, even on later visits (default: false)",
        }),
    })
    .meta({ description: "A reply the player can choose" });

export const ConversationNodeSchema = z
    .strictObject({
        say: LinesSchema.meta({
            description:
                "What the computer says, typed out: a line or a list (variables and markup work)",
        }),
        replies: z.array(ReplySchema).optional().meta({
            description: "The player's replies, numbered. Without any, the conversation ends here.",
        }),
        action: ActionSchema.optional().meta({
            description: "What happens on arriving here, after it has spoken, e.g. set a variable",
        }),
    })
    .meta({ description: "A part of a conversation: what the computer says, and the replies" });

export const ConversationSchema = z
    .strictObject({
        type: z.literal("conversation"),
        start: IdSchema.meta({ description: "The part it starts with" }),
        nodes: z.record(IdSchema, ConversationNodeSchema).meta({
            description: "The parts of the conversation, by name",
        }),
        speaker: z.string().default("").meta({
            description: 'Text before what the computer says, e.g. "MOTHER: "',
        }),
        you: z.string().default("> ").meta({
            description: "Text before the player's replies, as they're said (default: \"> \")",
        }),
        speed: z.number().min(0).default(25).meta({
            description: "Milliseconds per character as the computer speaks (default: 25)",
        }),
        ...ElementBaseShape,
    })
    .superRefine((conversation, ctx) => {
        const known = (id: string) => id in conversation.nodes;
        if (!known(conversation.start)) {
            ctx.addIssue({
                code: "custom",
                path: ["start"],
                message: `Unknown part "${conversation.start}"`,
            });
        }
        for (const [id, node] of Object.entries(conversation.nodes)) {
            node.replies?.forEach((reply, i) => {
                if (reply.next !== undefined && !known(reply.next)) {
                    ctx.addIssue({
                        code: "custom",
                        path: ["nodes", id, "replies", i, "next"],
                        message: `Unknown part "${reply.next}"`,
                    });
                }
            });
        }
    })
    .meta({
        description:
            "A conversation with a computer: it says something, the player picks a numbered " +
            "reply, and it answers, part by part, keeping a transcript",
    });

export type ConversationElement = z.output<typeof ConversationSchema> & ElementIdentity;
export type ConversationReply = z.output<typeof ReplySchema>;

/** What a conversation remembers from visit to visit: the replies it won't offer again. */
export interface ConversationMemory {
    used: string[];
}

/** A reply's key, to remember that it's been chosen: its part's name and its place there. */
export const replyKey = (node: string, index: number) => `${node}#${index}`;

/** The replies to offer at a part: those whose conditions hold, and once-only ones not yet chosen. */
export function offered(
    conversation: ConversationElement,
    node: string,
    used: readonly string[],
    holds: (condition: Condition) => boolean,
): { reply: ConversationReply; key: string }[] {
    return (conversation.nodes[node]?.replies ?? [])
        .map((reply, index) => ({ reply, key: replyKey(node, index) }))
        .filter(
            ({ reply, key }) =>
                (!reply.if || holds(reply.if)) && !(reply.once && used.includes(key)),
        );
}

export const conversationModule: ModuleDefinition<ConversationElement, ConversationMemory> = {
    // (the view draws the transcript)
    text: () => "",
    reveal: () => createTimedReveal(0),
    actions: (conversation) =>
        Object.values(conversation.nodes).flatMap((node) => [
            ...(node.action ? [node.action] : []),
            ...(node.replies ?? []).flatMap((reply) => (reply.action ? [reply.action] : [])),
        ]),
    conditions: (conversation) =>
        Object.values(conversation.nodes).flatMap((node) =>
            (node.replies ?? []).flatMap((reply) => (reply.if ? [reply.if] : [])),
        ),
};
