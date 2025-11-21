export interface PracticeDTO {
    name: string;
    description: string;
    icon: string;
    value_kind: string;
    target_value: number;
    target_unit: string;
    practice_operator: string;
    days_per_week: number;
    is_active: boolean;
}