import { useQuery } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { collectOptionPages } from "@/utils/pagination";

export function useDepartmentOptions() {
  return useQuery({
    queryKey: ["rest", "department-options"],
    queryFn: ({ signal }) =>
      collectOptionPages((page) =>
        api.departments.list.queryOptions({ input: { page, pageSize: 100 } }).queryFn({ signal }),
      ),
  });
}
export function useProgramOptions() {
  return useQuery({
    queryKey: ["rest", "program-options"],
    queryFn: ({ signal }) =>
      collectOptionPages((page) =>
        api.programs.list.queryOptions({ input: { page, pageSize: 100 } }).queryFn({ signal }),
      ),
  });
}
