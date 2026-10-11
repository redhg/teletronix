import dagre from "@dagrejs/dagre";
import {
    Badge,
    Button,
    Code,
    Group,
    Paper,
    Stack,
    Text,
    TextInput,
    useComputedColorScheme,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import {
    Background,
    Controls,
    type Edge,
    Handle,
    MarkerType,
    MiniMap,
    type Node,
    type NodeProps,
    type NodeTypes,
    Panel,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useNodesState,
    useReactFlow,
} from "@xyflow/react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { Program } from "../../engine/index.ts";
import { type MapNode, programGraph } from "./graph.ts";
import "@xyflow/react/dist/style.css";
import "./map.css";

// The editor's Map: every screen (and dialog, and timer) as a card on a surface to pan and
// zoom, and every way between them as an arrow, labelled. Laid out from the start screen
// down; cards can be moved, and stay where they're put (for that program, in this browser).
// Only for looking, for now: a double-click opens a card's screen or dialog to edit.

const WIDTH = 230;
/** A card's height, by its lines of text. */
const heightOf = (node: MapNode) => 58 + node.lines.length * 17;

type CardNode = Node<{ card: MapNode }, "card">;

/** Where each card goes: from the start screen down, by the ways between them. */
function arrange(nodes: MapNode[], edges: { from: string; to: string }[]) {
    const graph = new dagre.graphlib.Graph();
    graph.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 90, marginx: 20, marginy: 20 });
    graph.setDefaultEdgeLabel(() => ({}));
    for (const node of nodes) graph.setNode(node.id, { width: WIDTH, height: heightOf(node) });
    for (const edge of edges) if (edge.from !== edge.to) graph.setEdge(edge.from, edge.to);
    dagre.layout(graph);
    return new Map(
        nodes.map((node) => {
            const { x, y } = graph.node(node.id);
            return [node.id, { x: x - WIDTH / 2, y: y - heightOf(node) / 2 }];
        }),
    );
}

/** A screen, dialog or timer, as a card. */
function Card({ data: { card }, selected }: NodeProps<CardNode>) {
    const kind =
        card.kind === "screen"
            ? null
            : card.kind === "dialog"
              ? "dialog"
              : card.kind === "timer"
                ? "timer"
                : "bars";
    return (
        <Paper
            withBorder
            shadow={selected ? "md" : "xs"}
            p={8}
            w={WIDTH}
            className="map-card"
            data-kind={card.kind}
            data-start={card.start || undefined}
        >
            <Handle type="target" position={Position.Top} />
            <Group gap={6} wrap="nowrap" justify="space-between">
                <Text size="sm" fw={700} truncate>
                    {card.title}
                </Text>
                {card.start ? (
                    <Badge size="xs" color="green">
                        start
                    </Badge>
                ) : (
                    kind && (
                        <Badge
                            size="xs"
                            variant="light"
                            color={kind === "dialog" ? "grape" : "orange"}
                        >
                            {kind}
                        </Badge>
                    )
                )}
            </Group>
            <Code fz="xs">{card.name}</Code>
            {card.lines.length > 0 && (
                <Stack gap={0} mt={4} className="map-lines">
                    {card.lines.map((line, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: a card's lines don't move
                        <Text key={index} size="xs" c="dimmed" truncate>
                            {line}
                        </Text>
                    ))}
                </Stack>
            )}
            <Handle type="source" position={Position.Bottom} />
        </Paper>
    );
}

const NODE_TYPES: NodeTypes = { card: Card };

interface Props {
    program: Program;
    /** The program's name, to keep its cards' places by */
    name: string;
    /** Opens a card's screen ("screen:home") or dialog ("dialog:warning") to edit */
    open: (id: string) => void;
}

/** The editor's Map of a program. */
export default function ProgramMap(props: Props) {
    return (
        <ReactFlowProvider>
            <Surface {...props} />
        </ReactFlowProvider>
    );
}

function Surface({ program, name, open }: Props) {
    const graph = useMemo(() => programGraph(program), [program]);
    const [placed, setPlaced] = useLocalStorage<Record<string, { x: number; y: number }>>({
        key: `teletronix:map:${name}`,
        defaultValue: {},
    });
    const arranged = useMemo(() => arrange(graph.nodes, graph.edges), [graph]);
    const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([]);
    const flow = useReactFlow<CardNode>();

    // the cards: where they were put, or where they'd go
    useEffect(() => {
        setNodes(
            graph.nodes.map((card) => ({
                id: card.id,
                type: "card",
                position: placed[card.id] ?? arranged.get(card.id) ?? { x: 0, y: 0 },
                data: { card },
            })),
        );
    }, [graph, arranged, placed, setNodes]);

    const edges: Edge[] = useMemo(
        () =>
            graph.edges.map((edge) => ({
                id: edge.id,
                source: edge.from,
                target: edge.to,
                label: edge.label,
                className: edge.random ? "map-edge-random" : undefined,
                markerEnd: { type: MarkerType.ArrowClosed },
                labelBgPadding: [4, 2] as [number, number],
                labelBgBorderRadius: 3,
            })),
        [graph],
    );

    const [find, setFind] = useState("");
    const [notFound, setNotFound] = useState(false);
    const search = (event: FormEvent) => {
        event.preventDefault();
        const wanted = find.trim().toLowerCase();
        const found = graph.nodes.find(
            (card) =>
                card.title.toLowerCase().includes(wanted) ||
                card.name.toLowerCase().includes(wanted),
        );
        setNotFound(!found);
        if (!found) return;
        setNodes((was) => was.map((node) => ({ ...node, selected: node.id === found.id })));
        void flow.fitView({ nodes: [{ id: found.id }], duration: 400, maxZoom: 1.2 });
    };

    const scheme = useComputedColorScheme("light");
    return (
        <section className="program-map" aria-label="Map of the program">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                // (a card put somewhere stays there)
                onNodeDragStop={(_event, _node, moved) =>
                    setPlaced((was) => ({
                        ...was,
                        ...Object.fromEntries(moved.map((node) => [node.id, node.position])),
                    }))
                }
                onNodeDoubleClick={(_event, node) => {
                    if (node.id.startsWith("screen:") || node.id.startsWith("dialog:"))
                        open(node.id);
                }}
                nodesConnectable={false}
                colorMode={scheme}
                minZoom={0.1}
                fitView
                fitViewOptions={{ padding: 0.1 }}
            >
                <Background gap={20} />
                <Controls showInteractive={false} />
                {/* (top right: the cards fitted in fill the bottom) */}
                <MiniMap
                    pannable
                    zoomable
                    position="top-right"
                    style={{ width: 160, height: 110 }}
                />
                <Panel position="top-left">
                    <Paper p={6} shadow="xs" withBorder>
                        <form onSubmit={search}>
                            <Group gap={6}>
                                <TextInput
                                    size="xs"
                                    aria-label="Find a screen"
                                    placeholder="Find a screen"
                                    value={find}
                                    error={notFound}
                                    onChange={(event) => {
                                        setFind(event.currentTarget.value);
                                        setNotFound(false);
                                    }}
                                />
                                <Button
                                    size="xs"
                                    variant="light"
                                    type="submit"
                                    disabled={!find.trim()}
                                >
                                    Find
                                </Button>
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    onClick={() => {
                                        setPlaced({});
                                        requestAnimationFrame(
                                            () => void flow.fitView({ duration: 400 }),
                                        );
                                    }}
                                    title="Put every card back where it'd go"
                                >
                                    Arrange again
                                </Button>
                            </Group>
                        </form>
                        <Text size="xs" c="dimmed" mt={4}>
                            Drag to move about, scroll to zoom; double-click a card to edit it.
                        </Text>
                    </Paper>
                </Panel>
            </ReactFlow>
        </section>
    );
}
