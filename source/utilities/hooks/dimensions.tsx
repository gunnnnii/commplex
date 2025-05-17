import { useStdout } from "ink";
import { useState, useEffect } from "react";

export function useColumns() {
  const { stdout } = useStdout();
  const [columns, setColumns] = useState(stdout.columns);

  useEffect(() => {
    const onResize = () => {
      setColumns(stdout.columns);
    }
    stdout.on('resize', onResize);

    return () => {
      stdout.off('resize', onResize);
    }
  }, [stdout]);

  return columns
}

export function useRows() {
  const { stdout } = useStdout();
  const [rows, setRows] = useState(stdout.rows);

  useEffect(() => {
    const onResize = () => {
      setRows(stdout.rows);
    }

    stdout.on('resize', onResize);

    return () => {
      stdout.off('resize', onResize);
    }
  }, [stdout]);

  return rows
}
