import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, TextInput } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import { toast } from "react-hot-toast";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// Update JSON at a specific path
const updateJsonAtPath = (json: any, path: NodeData["path"], newValue: any): any => {
  if (!path || path.length === 0) {
    return newValue;
  }

  const jsonCopy = JSON.parse(JSON.stringify(json));
  let current = jsonCopy;

  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }

  const lastKey = path[path.length - 1];
  current[lastKey] = newValue;

  return jsonCopy;
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const getJson = useJson(state => state.getJson);
  const fileContents = useFile.getState().getContents();
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [editedName, setEditedName] = React.useState("");
  const [editedColor, setEditedColor] = React.useState("");
  const [originalName, setOriginalName] = React.useState("");
  const [originalColor, setOriginalColor] = React.useState("");
  // Details node states
  const [editedType, setEditedType] = React.useState("");
  const [editedSeason, setEditedSeason] = React.useState("");
  const [originalType, setOriginalType] = React.useState("");
  const [originalSeason, setOriginalSeason] = React.useState("");
  // Nutrients node states (dynamic key-value map)
  const [editedNutrients, setEditedNutrients] = React.useState<Record<string, string>>({});
  const [originalNutrients, setOriginalNutrients] = React.useState<Record<string, string>>({});

  const path = nodeData?.path;
  const isFruitObjectNode = React.useMemo(() => {
    if (!path || path.length < 2) return false;
    return path[0] === "fruits" && typeof path[1] === "number" && path.length === 2;
  }, [path]);
  const isDetailsNode = React.useMemo(() => {
    if (!path || path.length < 3) return false;
    return path[0] === "fruits" && typeof path[1] === "number" && path[2] === "details";
  }, [path]);
  const isNutrientsNode = React.useMemo(() => {
    if (!path || path.length < 3) return false;
    return path[0] === "fruits" && typeof path[1] === "number" && path[2] === "nutrients";
  }, [path]);

  React.useEffect(() => {
    if (nodeData && isFruitObjectNode) {
      const content = normalizeNodeData(nodeData.text ?? []);
      try {
        const parsed = JSON.parse(content);
        const name = parsed.name || "";
        const color = parsed.color || "";
        setOriginalName(name);
        setOriginalColor(color);
        setEditedName(name);
        setEditedColor(color);
      } catch {
        setOriginalName("");
        setOriginalColor("");
        setEditedName("");
        setEditedColor("");
      }
    } else if (nodeData && isDetailsNode) {
      const content = normalizeNodeData(nodeData.text ?? []);
      try {
        const parsed = JSON.parse(content);
        const type = parsed.type || "";
        const season = parsed.season || "";
        setOriginalType(type);
        setOriginalSeason(season);
        setEditedType(type);
        setEditedSeason(season);
      } catch {
        setOriginalType("");
        setOriginalSeason("");
        setEditedType("");
        setEditedSeason("");
      }
    } else if (nodeData && isNutrientsNode) {
      const content = normalizeNodeData(nodeData.text ?? []);
      try {
        const parsed = JSON.parse(content);
        const initial = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
        setOriginalNutrients(initial);
        setEditedNutrients(initial);
      } catch {
        setOriginalNutrients({});
        setEditedNutrients({});
      }
    } else {
      // Clear edit fields for non-fruit nodes
      setOriginalName("");
      setOriginalColor("");
      setEditedName("");
      setEditedColor("");
      setOriginalType("");
      setOriginalSeason("");
      setEditedType("");
      setEditedSeason("");
      setOriginalNutrients({});
      setEditedNutrients({});
      setIsEditMode(false);
    }
  }, [nodeData, isFruitObjectNode, isDetailsNode, isNutrientsNode]);

  React.useEffect(() => {
    if (!opened) setIsEditMode(false);
  }, [opened]);

  const handleEditClick = () => setIsEditMode(true);

  const handleSave = () => {
    if (!nodeData) {
      setIsEditMode(false);
      return;
    }
    try {
      const currentJson = JSON.parse(fileContents || getJson());
      const existingValue = (nodeData.path || []).reduce((obj, key) => obj[key], currentJson);
      let updatedValue: any = existingValue;
      if (isFruitObjectNode) {
        updatedValue = { ...existingValue, name: editedName, color: editedColor };
      } else if (isDetailsNode) {
        updatedValue = { ...existingValue, type: editedType, season: editedSeason };
      } else if (isNutrientsNode) {
        updatedValue = { ...existingValue, ...editedNutrients };
      } else {
        // Non-editable node
        setIsEditMode(false);
        return;
      }
      const updatedJson = updateJsonAtPath(currentJson, nodeData.path, updatedValue);
      const updatedStr = JSON.stringify(updatedJson, null, 2);
      // Update editor contents (which will propagate back to useJson via debounce)
      useFile.getState().setContents({ contents: updatedStr, hasChanges: true });
      // Ensure immediate graph update even if debounce is delayed
      useJson.getState().setJson(updatedStr);
      if (isFruitObjectNode) {
        setOriginalName(editedName);
        setOriginalColor(editedColor);
      } else if (isDetailsNode) {
        setOriginalType(editedType);
        setOriginalSeason(editedSeason);
      } else if (isNutrientsNode) {
        setOriginalNutrients({ ...editedNutrients });
      }
      setIsEditMode(false);
      toast.success("Changes saved successfully!");
    } catch (error) {
      console.error("Error saving changes:", error);
      toast.error("Error saving changes. Please try again.");
    }
  };

  const handleCancel = () => {
    if (isFruitObjectNode) {
      setEditedName(originalName);
      setEditedColor(originalColor);
    } else if (isDetailsNode) {
      setEditedType(originalType);
      setEditedSeason(originalSeason);
    } else if (isNutrientsNode) {
      setEditedNutrients({ ...originalNutrients });
    }
    setIsEditMode(false);
  };

  return (
    <Modal size="auto" opened={opened} onClose={() => { setIsEditMode(false); onClose(); }} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Flex justify="space-between" align="center">
          <Text fz="xs" fw={500}>Content</Text>
          <Flex gap="xs" align="center">
            {(isFruitObjectNode || isDetailsNode || isNutrientsNode) && (
              isEditMode ? (
                <>
                  <Button onClick={handleSave} color="green" size="xs">Save</Button>
                  <Button onClick={handleCancel} color="red" size="xs">Cancel</Button>
                </>
              ) : (
                <Button onClick={handleEditClick} color="blue" size="xs">Edit</Button>
              )
            )}
            <CloseButton onClick={() => { setIsEditMode(false); onClose(); }} />
          </Flex>
        </Flex>
        <ScrollArea.Autosize mah={250} maw={600}>
          {(isFruitObjectNode || isDetailsNode || isNutrientsNode) && isEditMode ? (
            <Stack gap="sm">
              {isFruitObjectNode && (
                <>
                  <TextInput
                    label="Name"
                    value={editedName}
                    onChange={e => setEditedName(e.currentTarget.value)}
                    placeholder="Enter name"
                    styles={{ input: { minWidth: "350px" } }}
                  />
                  <TextInput
                    label="Color"
                    value={editedColor}
                    onChange={e => setEditedColor(e.currentTarget.value)}
                    placeholder="Enter color (e.g., #FF0000)"
                    styles={{ input: { minWidth: "350px" } }}
                  />
                </>
              )}
              {isDetailsNode && (
                <>
                  <TextInput
                    label="Type"
                    value={editedType}
                    onChange={e => setEditedType(e.currentTarget.value)}
                    placeholder="Enter type"
                    styles={{ input: { minWidth: "350px" } }}
                  />
                  <TextInput
                    label="Season"
                    value={editedSeason}
                    onChange={e => setEditedSeason(e.currentTarget.value)}
                    placeholder="Enter season"
                    styles={{ input: { minWidth: "350px" } }}
                  />
                </>
              )}
              {isNutrientsNode && Object.keys(editedNutrients).map(key => (
                <TextInput
                  key={key}
                  label={key}
                  value={editedNutrients[key]}
                  onChange={e => setEditedNutrients(prev => ({ ...prev, [key]: e.currentTarget.value }))}
                  placeholder={`Enter ${key}`}
                  styles={{ input: { minWidth: "350px" } }}
                />
              ))}
            </Stack>
          ) : (
            <CodeHighlight
              code={normalizeNodeData(nodeData?.text ?? [])}
              miw={350}
              maw={600}
              language="json"
              withCopyButton
            />
          )}
        </ScrollArea.Autosize>
        <Text fz="xs" fw={500}>JSON Path</Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
