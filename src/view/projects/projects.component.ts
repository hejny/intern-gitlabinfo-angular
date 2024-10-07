import {Component, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {NgClass, NgForOf, NgIf} from "@angular/common";
import {FormControl, FormsModule, ReactiveFormsModule} from "@angular/forms";
import {GitLabProject, ModelError} from 'intern-gitlabinfo-openapi-angular';
import {ProjectService} from '../../service/project.service';
import {HttpClientModule} from '@angular/common/http';
import {CookieService} from '../../service/cookie.service';
import {Subject, takeUntil} from 'rxjs';
import {MatTableModule} from '@angular/material/table';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatSort, MatSortModule, Sort} from '@angular/material/sort';
import {MatCheckboxChange, MatCheckboxModule} from '@angular/material/checkbox';
import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatMenuModule} from '@angular/material/menu';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatDividerModule} from '@angular/material/divider'; // <-- Add MatDividerModule
import {Router} from '@angular/router';
import {Column, ColumnId, columnSettings} from '../../model/columns';
import {Error} from '../../model/errors';
import {DisplayTextUtils} from '../../util/displayTextUtils';
import {archivedSelectSettings, ArchivedType, Filter} from '../../model/filters';


const DEFAULT_ITEMS_PER_PAGE = 5;
const DEFAULT_SORT_ORDER: 'asc' | 'desc' = 'asc';

export enum DropdownType {
  COLUMNS = 'columnsOpen',
  KIND = 'kindOpen',
  ERRORS = 'errorsOpen'
}

export const ARCHIVED = 'archived';
export const COMMON_FILTER = 'commonFilter';
export const COLUMNS = 'columns';
export const ALL = 'All';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [
    NgForOf,
    NgIf,
    ReactiveFormsModule,
    NgClass,
    FormsModule,
    HttpClientModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatCheckboxModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    MatTooltipModule,
    MatDividerModule
  ],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss'
})
export class ProjectsComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  // Observables for tracking changes
  private currentPageSubject = new Subject<number>();
  private itemsPerPageSubject = new Subject<number | 'all'>();
  private sortOrderSubject = new Subject<'asc' | 'desc'>();
  private sortColumnSubject = new Subject<string | null>();
  private useRegexSubject = new Subject<boolean>();
  private commonFilterSubject = new Subject<string>();

  // Projects data
  projects: GitLabProject[] = [];
  filteredData: GitLabProject[] = [];
  paginatedData: GitLabProject[] = [];

  // Dropdown state management
  dropdownState: Record<DropdownType, boolean> = {
    [DropdownType.COLUMNS]: false,
    [DropdownType.KIND]: false,
    [DropdownType.ERRORS]: false
  };

  // Selection states
  allErrorsSelected: boolean = true;

  // Pagination
  currentPage: number | undefined;
  itemsPerPage: number | 'all' | undefined | any;
  selectedItemsPerPageOption: number | 'all' | 'custom' | undefined;
  customRowsPerPage: number | null = null;
  itemsPerPageOptions: any = [5, 10, 15, 20, 50, 100, 'all', 'custom'];

  // Sorting
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  commonFilter: string = '';
  useRegex: any;

  selectedColumnIds: any;

  columnsForm: FormControl<Column[]> = new FormControl();
  archivedForm: FormControl<Filter[]> = new FormControl();
  kindForm: FormControl<Filter[]> = new FormControl();
  errorForm: FormControl<Error[]> = new FormControl();

  columns: Column[] = Object.values(columnSettings);
  selectedColumns: Column[] = this.columnsForm.value;
  archivedTypes: Filter[] = Object.values(archivedSelectSettings);
  selectedArchivedTypes: Filter[] = this.archivedForm.value;
  kinds: Filter[] = [];
  selectedKinds: Filter[] = this.kindForm.value;
  errors: Error[] = [];
  selectedErrors: Error[] = this.errorForm.value;

  selectedFilters: Filter[] = this.archivedForm.value;

  private columnSubjects: { [key: string]: Subject<void> } = {};
  private kindSubjects: { [key: string]: Subject<void> } = {};
  private errorSubjects: { [key: string]: Subject<void> } = {};
  private archivedSubjects: { [key: string]: Subject<void> } = {};

  @ViewChild(MatSort) sort: MatSort | undefined;

  displayTextUtils: DisplayTextUtils;

  constructor(private projectService: ProjectService,
              private cookieService: CookieService,
              private router: Router
  ) {
    this.displayTextUtils = new DisplayTextUtils(this.cookieService);
  }

  ngOnInit() {
    this.setInitialValues();      // Retrieve data from cookies
    this.loadProjects();          // Load projects from the service
    this.subscribeToChanges();
  }

  subscribeToChanges() {
    this.currentPageSubject.pipe(takeUntil(this.destroy$)).subscribe(() => this.updateCookie());
    this.itemsPerPageSubject.pipe(takeUntil(this.destroy$)).subscribe(() => this.updateCookie());
    this.sortOrderSubject.pipe(takeUntil(this.destroy$)).subscribe(() => this.updateCookie());
    this.sortColumnSubject.pipe(takeUntil(this.destroy$)).subscribe(() => this.updateCookie());
    this.useRegexSubject.pipe(takeUntil(this.destroy$)).subscribe(() => this.updateCookie());
    this.commonFilterSubject.pipe(takeUntil(this.destroy$)).subscribe(() => this.updateCookie());
    this.columns.forEach(column => {
      if (!this.columnSubjects[column.id]) {
        this.columnSubjects[column.id] = new Subject<void>();
      }
      this.columnSubjects[column.id].pipe(takeUntil(this.destroy$)).subscribe(() => this.updateCookie());
    });
    const selectedColumns = this.columns.filter(c => c.selected);
    this.selectedColumns = selectedColumns;
    this.columnsForm.setValue(selectedColumns)
  }

  loadProjects() {
    this.projectService.getGitLabProjects().subscribe(
      (data: GitLabProject[]) => {
        this.projects = data;
        this.filteredData = [...this.projects];
        this.setKinds();
        this.setErrors();
        this.applyFilters();
      }
    );
  }

  setInitialValues() {
    // current page number
    this.currentPage = Number(this.cookieService.getCookie("page")) || 1;

    // items per page
    const itemsPerPageCookie = this.cookieService.getCookie("size");
    if (itemsPerPageCookie) {
      if (itemsPerPageCookie === 'custom' || itemsPerPageCookie === 'all') {
        this.selectedItemsPerPageOption = itemsPerPageCookie;
      } else {
        const parsedValue = Number(itemsPerPageCookie);
        this.selectedItemsPerPageOption = isNaN(parsedValue) ? undefined : parsedValue;
      }
    } else {
      this.selectedItemsPerPageOption = this.itemsPerPageOptions[0];
    }
    this.itemsPerPage = this.selectedItemsPerPageOption === 'all' || this.selectedItemsPerPageOption === 'custom'
      ? this.selectedItemsPerPageOption
      : (this.selectedItemsPerPageOption as number || DEFAULT_ITEMS_PER_PAGE);

    // columns
    const selectedColumns = this.cookieService.getCookie(COLUMNS);
    if (selectedColumns) {
      const selectedColumnIds = selectedColumns.split(",");
      this.columns.forEach(column => {
        column.selected = selectedColumnIds.includes(column.id);
      });
      const allSelected = this.getSelectedColumns().length;
      let all = this.columns.filter(c => c.id === ColumnId.ALL)[0];
      all.selected = allSelected - 1 === this.columns.length;
      this.selectedColumnIds = this.columns.filter(c => c.selected).map(c => c.id);
    }

    // sorting
    this.sortColumn = this.cookieService.getCookie('sortBy') || '';
    this.sortDirection = (this.cookieService.getCookie('sortDest') as 'asc' | 'desc') || DEFAULT_SORT_ORDER;
    const sortState: Sort = {active: this.sortColumn, direction: this.sortDirection};
    if (this.sort) {
      this.sort.active = sortState.active;
      this.sort.direction = sortState.direction;
      this.sort.sortChange.emit(sortState);
    }

    // use regex
    this.useRegex = this.cookieService.getCookie('userRegex') === 'true' || false;

    // archived types
    this.setPossibleArchived();
  }

  updateCookie() {
    if (this.currentPage !== undefined && this.currentPage !== null) {
      this.cookieService.setCookie("page", this.currentPage.toString());
    }
    if (this.itemsPerPage !== undefined && this.itemsPerPage !== null) {
      this.cookieService.setCookie("size", this.itemsPerPage.toString());
    }
    if (this.sortDirection !== undefined && this.sortDirection !== null) {
      this.cookieService.setCookie("sortDest", this.sortDirection.toString());
    }
    this.cookieService.setCookie("sortBy", this.sortColumn || '');

    // selected columns
    let selectedColumnIds = this.columns
      .filter(col => col.selected)
      .map(col => col.id).join(",");
    if (selectedColumnIds.length === 0) {
      selectedColumnIds = '';
    }
    this.cookieService.setCookie(COLUMNS, selectedColumnIds);

    // selected kinds
    const selectedKinds = this.kinds
      .filter(kind => kind.selected)
      .map(kind => kind.name).join(",");
    this.cookieService.setCookie(ColumnId.KINDS, selectedKinds.length ? selectedKinds : '');

    // selected errors
    const selectedErrors = this.errors
      .filter(error => error.selected)
      .map(error => error.code).join(",");
    this.cookieService.setCookie(ColumnId.ERRORS, selectedErrors.length ? selectedErrors : '');

    // archived types
    const selectedArchivedTypes = this.archivedTypes
      .filter(type => type.selected)
      .map(type => type.name).join(",");
    this.cookieService.setCookie(ARCHIVED, selectedArchivedTypes.length ? selectedArchivedTypes : '');
  }

  setKinds() {
    const cookiedKinds = this.cookieService.getCookie(ColumnId.KINDS);
    let kindsSet = new Set(this.projects.map(project => project.kind));
    kindsSet.add(ALL);
    for (const kind of kindsSet) {
      const possibleKind: Filter = {
        name: kind,
        selected: (cookiedKinds != null && cookiedKinds.includes(kind)) || cookiedKinds?.length == 0
      };
      this.kindSubjects[possibleKind.name] = new Subject<void>();
      this.kindSubjects[possibleKind.name].pipe(takeUntil(this.destroy$)).subscribe(() => this.updateCookie());
      this.kinds.push(possibleKind);
    }
    const selectedKinds = this.kinds.filter(k => k.selected) || [];
    this.kindForm.setValue(selectedKinds);
  }

  setErrors() {
    const errorMap = new Map<string, string>(); // Key: error code, Value: error message
    this.projects.forEach(project => {
      if (Array.isArray(project.errors)) {
        project.errors.forEach(error => {
          if (error.code && error.message) {
            errorMap.set(error.code, error.message);
          }
        });
      }
      if (Array.isArray(project.branches)) {
        project.branches.forEach(branch => {
          if (Array.isArray(branch.errors)) {
            branch.errors.forEach(error => {
              if (error.code && error.message) {
                errorMap.set(error.code, error.message);
              }
            });
          }
        });
      }
    });
    errorMap.set(ALL, 'All errors');

    const cookiedErrors = this.cookieService.getCookie(ColumnId.ERRORS)?.split(',') || [];
    for (const [code, message] of errorMap) {
      const possibleError: Error = {
        code: code,
        message: message,
        selected: cookiedErrors.includes(code) || cookiedErrors.includes(ALL)
      };

      this.errorSubjects[possibleError.code] = new Subject<void>();
      this.errorSubjects[possibleError.code].pipe(takeUntil(this.destroy$)).subscribe(() => this.updateCookie());
      this.errors.push(possibleError);
    }
    const selectedErrors = this.errors.filter(e => e.selected) || [];
    this.errorForm.setValue(selectedErrors);
  }

  setPossibleArchived() {
    const cookiedArhived = this.cookieService.getCookie(ARCHIVED)?.split(',') || [];
    for (let i = 0; i < this.archivedTypes.length; i++) {
      const archived = this.archivedTypes[i];
      this.archivedTypes[i].selected = cookiedArhived.includes(archived.name);
      if (!this.archivedSubjects[archived.name]) {
        this.archivedSubjects[archived.name] = new Subject<void>();
      }
      this.archivedSubjects[archived.name].pipe(takeUntil(this.destroy$)).subscribe(() => this.updateCookie());
    }
    const selectedArchived = this.archivedTypes.filter(t => t.selected);
    this.archivedForm.setValue(selectedArchived);
  }

  get totalPages() {
    return this.itemsPerPage === 'all'
      ? 1
      : Math.ceil(this.filteredData.length / (this.itemsPerPage as number));
  }

  toggleDropdown(type: DropdownType) {
    this.dropdownState[type] = !this.dropdownState[type];
  }

  toggleColumnSelection(columnId: string): void {
    const column = this.columns.find(col => col.id === columnId);
    if (column) {
      column.selected = !column.selected;
      if (column.id === ColumnId.ALL) {
        this.columns.every(e => e.selected = column.selected);
        this.columnsForm.setValue(column.selected ? this.columns : []);
      } else {
        const allSelected = this.columns
          .filter(t => t.id !== ColumnId.ALL)
          .map(t => t.selected);
        const areAllSelectedSame = new Set(allSelected).size === 1;
        let all = this.columns
          .filter(t => t.id === ColumnId.ALL)[0];
        if (areAllSelectedSame) {
          all.selected = allSelected[0];
        } else {
          all.selected = false;
        }
        const selectedColumns = this.columns.filter(t => t.selected) || [];
        this.columnsForm.setValue(selectedColumns)
      }
      this.columnSubjects[columnId].next();
      const updatedColumns = this.getSelectedColumns();
      this.selectedColumns = [...updatedColumns];
      this.selectedColumnIds = this.selectedColumns.map(c => c.id);
    }
  }

  toggleKindSelection(name: string) {
    const kind = this.kinds.find(k => k.name === name);
    if (kind) {
      kind.selected = !kind.selected;
      if (kind.name === ALL) {
        this.kinds.every(e => e.selected = kind.selected);
        this.kindForm.setValue(kind.selected ? this.kinds : []);
      } else {
        const allSelected = this.kinds
          .filter(t => t.name !== ALL)
          .map(t => t.selected);
        const areAllSelectedSame = new Set(allSelected).size === 1;
        let allType = this.kinds
          .filter(t => t.name === ALL)[0];
        if (areAllSelectedSame) {
          allType.selected = allSelected[0];
        } else {
          allType.selected = false;
        }
        const selected = this.kinds.filter(t => t.selected) || [];
        this.kindForm.setValue(selected)
      }
      this.kindSubjects[name].next();
      const updated = this.getSelectedKinds();
      this.selectedKinds = [...updated];
      this.applyFilters();
    }
  }

  toggleErrorSelection(code: string): void {
    const error = this.errors.find(e => e.code === code);
    if (error) {
      error.selected = !error.selected;
      if (error.code === ALL) {
        this.errors.every(e => e.selected = error.selected);
        this.errorForm.setValue(error.selected ? this.errors : []);
      } else {
        const allSelected = this.errors
          .filter(t => t.code !== ALL)
          .map(t => t.selected);
        const areAllSelectedSame = new Set(allSelected).size === 1;
        let all = this.errors
          .filter(t => t.code === ALL)[0];
        if (areAllSelectedSame) {
          all.selected = allSelected[0];
        } else {
          all.selected = false;
        }
        const selected = this.errors.filter(t => t.selected) || [];
        this.errorForm.setValue(selected)
      }
      this.errorSubjects[code].next();
      const updated = this.getSelectedErrors();
      this.selectedErrors = [...updated];
      this.applyFilters();
    }
  }

  toggleArchivedSelection(name: string) {
    const archivedType = this.archivedTypes.find(t => t.name === name);
    if (archivedType) {
      archivedType.selected = !archivedType.selected;
      if (name === ArchivedType.ALL) {
        this.archivedTypes.every(e => e.selected = archivedType.selected);
        this.archivedForm.setValue(archivedType.selected ? this.archivedTypes : []);
      } else {
        const allSelected = this.archivedTypes
          .filter(t => t.name !== ArchivedType.ALL)
          .map(t => t.selected);
        const areAllSelectedSame = new Set(allSelected).size === 1;
        let allType = this.archivedTypes
          .filter(t => t.name === ArchivedType.ALL)[0];
        if (areAllSelectedSame) {
          allType.selected = allSelected[0];
        } else {
          allType.selected = false;
        }
        const selectedTypes = this.archivedTypes.filter(t => t.selected) || [];
        this.archivedForm.setValue(selectedTypes)
      }
      this.archivedSubjects[name].next();
      const updatedArchivedTypes = this.getSelectedArchived();
      this.selectedArchivedTypes = [...updatedArchivedTypes];
      this.applyFilters();
    }
  }

  onItemsPerPageChange() {
    if (this.selectedItemsPerPageOption === 'custom') {
      this.customRowsPerPage = null;
    } else {
      this.itemsPerPage = this.selectedItemsPerPageOption as number | 'all';
    }
    if (this.itemsPerPage === undefined || this.itemsPerPage === null) {
      this.itemsPerPage = DEFAULT_ITEMS_PER_PAGE;
    }
    this.currentPage = 1;
    this.itemsPerPageSubject.next(this.itemsPerPage);
    this.updatePaginatedData();
  }

  changePage(increment: number) {
    this.currentPage = this.currentPage ?? 1;
    const newPage = this.currentPage + increment;
    if (newPage > 0 && newPage <= this.totalPages) {
      this.currentPage = newPage;
      this.currentPageSubject.next(this.currentPage);
      this.updatePaginatedData();
    }
  }

  sortData(columnId: string | null, dist: string | null) {
    if (columnId !== null && dist !== null) {
      if (columnId) {
        this.sortColumn = columnId;
        this.sortDirection = dist === 'asc' ? 'asc' : 'desc';
        this.sortColumnSubject.next(this.sortColumn);
        this.sortOrderSubject.next(this.sortDirection);

        if (columnId !== ColumnId.ERRORS) {
          this.filteredData.sort((a, b) => {
            const valueA = this.getRowValue(a, columnId)?.toString().toLowerCase() ?? '';
            const valueB = this.getRowValue(b, columnId)?.toString().toLowerCase() ?? '';
            return (valueA > valueB ? 1 : -1) * (dist === 'asc' ? 1 : -1);
          });
        } else {
          this.filteredData.sort((a, b) => {
            const errorsA = this.getErrorValues(a);
            const errorsB = this.getErrorValues(b);
            const codesA = errorsA.map(e => e.code).join('');
            const codesB = errorsB.map(e => e.code).join('');
            if (codesA.length === 0 && codesB.length === 0) return 0;
            return (codesA > codesB ? 1 : -1) * (dist === 'asc' ? 1 : -1);
          });
        }
      }
    }
    this.updatePaginatedData();
  }

  updatePaginatedData() {
    this.currentPage = this.currentPage ?? 1;
    let endIndex: number;
    endIndex = this.currentPage * (this.itemsPerPage === 'all' ? this.filteredData.length : this.itemsPerPage as number);
    if (endIndex > this.filteredData.length) {
      endIndex = this.filteredData.length;
    }
    let startIndex: number;
    if (this.currentPage > 1) {
      startIndex = (this.currentPage - 1) * (this.itemsPerPage === 'all' ? this.filteredData.length : this.itemsPerPage as number);
    } else {
      startIndex = 0;
    }
    if (startIndex > endIndex) {
      startIndex = endIndex - this.itemsPerPage;
      this.currentPage = this.totalPages
    }
    if (startIndex < 1) {
      startIndex = 0;
    }
    this.paginatedData = this.filteredData.slice(startIndex, endIndex);
  }

  getRowValue(project: GitLabProject, columnId: string): string {
    return this.displayTextUtils.getRowValue(project, columnId);
  }

  getErrorValues(project: GitLabProject): ModelError[] {
    let errors: ModelError[] = project.errors ?? [];
    let branchesErrors: ModelError[] = [];
    project.branches.forEach((branch) => {
      branchesErrors.push(...(branch.errors ?? []));
    });
    const uniqueErrorCodes = new Set<string>();
    const allErrors: ModelError[] = [...errors, ...branchesErrors].filter((error) => {
      if (!uniqueErrorCodes.has(error.code)) {
        uniqueErrorCodes.add(error.code);
        return true;
      }
      return false;
    });

    allErrors.sort((a, b) => a.code.localeCompare(b.code));

    return allErrors;
  }

  getErrors(project: GitLabProject): string {
    return this.displayTextUtils.getErrors(project);
  }

  applyFilters() {
    const nameFilter = this.cookieService.getCookie(ColumnId.NAME) || '';
    const defaultBranchFilter = this.cookieService.getCookie(ColumnId.DEFAULT_BRANCH) || '';
    const parentArtifactIdFilter = this.cookieService.getCookie(ColumnId.PARENT_ARTIFACT_ID) || '';
    const parentVersionFilter = this.cookieService.getCookie(ColumnId.PARENT_VERSION) || '';
    const descriptionFilter = this.cookieService.getCookie(ColumnId.DESCRIPTION) || '';
    const commonFilter = this.cookieService.getCookie(COMMON_FILTER) || '';
    const useRegex = this.cookieService.getCookie('useRegex') === 'true';
    const selectedKinds = this.getSelectedKinds();
    let selectedErrors = this.getSelectedErrors();
    const selectedArchived = this.getSelectedArchived();
    const mustBeLive = selectedArchived.filter(a => a.name === ArchivedType.LIVE).length > 0;
    const allArchivedType = selectedArchived.filter(a => a.name === ArchivedType.ALL).length > 0;
    const allKinds = selectedKinds.filter(a => a.name === ALL).length > 0;
    const allErrors = selectedErrors.filter(e => e.code === ALL).length > 0;

    this.filteredData = this.projects.filter(project => {
      const matchesRegexOrIncludes = (value: string, filter: string) => {
        if (useRegex) {
          try {
            const regex = new RegExp(filter, 'i');
            return regex.test(value || '');
          } catch (e) {
            console.error('Invalid regex pattern: ', filter);
            return false;
          }
        } else {
          return value?.toLowerCase().includes(filter.toLowerCase());
        }
      };
      const matchesName = matchesRegexOrIncludes(project.name, nameFilter);
      const matchesDefaultBranch = matchesRegexOrIncludes(project.defaultBranch?.name, defaultBranchFilter);
      const matchesParentArtifactId = matchesRegexOrIncludes(project.defaultBranch?.parent?.artifactId ?? '', parentArtifactIdFilter);
      const matchesParentVersion = matchesRegexOrIncludes(project.defaultBranch?.parent?.version ?? '', parentVersionFilter);
      const matchesDescription = matchesRegexOrIncludes(project.description ?? '', descriptionFilter);
      const matchesKind = allKinds || selectedKinds.map(k => k.name)?.includes(project.kind);
      const projectErrors = this.getErrors(project) ?? [];
      let errors = projectErrors.split(',').filter(error => error.trim() !== '') ?? [];
      const matchesErrors = allErrors || selectedErrors.length === 0 || this.isErrorsSelected(errors, selectedErrors);
      const isArchived = project.archived;
      const matchesArchived = allArchivedType || (mustBeLive && !isArchived || !mustBeLive && isArchived);
      const matchesCommonFilter = selectedArchived.length !== 0 && (this.isCommonFilterMatched(project, commonFilter.toLowerCase()));

      return (
        matchesName &&
        matchesDefaultBranch &&
        matchesParentArtifactId &&
        matchesParentVersion &&
        matchesDescription &&
        matchesKind &&
        matchesErrors &&
        matchesCommonFilter &&
        matchesArchived
      );
    });
    // sort
    const sortBy = this.cookieService.getCookie('sortBy');
    const sortDest = this.cookieService.getCookie('sortDest');
    this.sortData(sortBy, sortDest);
  }

  isCommonFilterMatched(project: GitLabProject, commonFilter: string): boolean {
    const propertiesToCheck: string[] = [
      project.name,
      project.url,
      project.kind,
      project.description ?? '',
      project.cicd?.configurationFile ?? '',
      this.getErrors(project)
    ];
    const checkMinProps = this.filter(propertiesToCheck, commonFilter);
    if (checkMinProps) {
      return checkMinProps;
    }

    const variables = project.cicd.variables;
    for (const key in variables) {
      if (variables.hasOwnProperty(key)) {
        const keyIncl = key.toLowerCase().includes(commonFilter);
        const valueIncl = variables[key].toLowerCase().includes(commonFilter);
        if (keyIncl || valueIncl) {
          return true;
        }
      }
    }

    const branches = project.branches;
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      const toCheck = [
        branch.name,
        branch.lastCommitCreatedAt,
        branch.gitLabConfig,
        branch.groupId,
        branch.artifactId,
        branch.parent?.artifactId,
        branch.parent?.version,
        this.getErrors(project)
      ];
      const checkBranchProps = this.filter(toCheck, commonFilter);
      if (checkBranchProps) {
        return checkBranchProps;
      }
    }

    return false;
  }

  filter(propertiesToCheck: any[], filter: string) {
    for (const prop of propertiesToCheck) {
      if (prop?.toLowerCase().includes(filter)) {
        return true;
      }
    }
    return false;
  }

  isErrorsSelected(errors: string[], selectedErrors: Error[]) {
    if (selectedErrors.length === 0) {
      return true;
    }
    const trimmedErrors = errors.map(error => error.trim());
    for (let i = 0; i < selectedErrors.length; i++) {
      const selectedError = selectedErrors[i].code.trim();
      const isSelected = trimmedErrors.includes(selectedError);
      if (!isSelected) {
        return false;
      }
    }
    return true;
  }

  getSelectedColumns() {
    if (this.columnsForm.value === null) {
      return [];
    }
    return this.columnsForm.value.filter((c: Column) => c.selected && c.id !== ColumnId.ALL);
  }

  getSelectedArchived() {
    const types = this.archivedForm.value;
    if (types == null) {
      return [];
    }
    return this.archivedForm.value.filter((c: Filter) => c.selected && c.name !== ColumnId.ALL);
  }

  getSelectedArchivedName() {
    const savedArchivedTypes = this.cookieService.getCookie(ARCHIVED)?.split(',') ?? [];
    const archiveTypes = [ArchivedType.ALL, ArchivedType.LIVE, ArchivedType.ARCHIVED];
    return archiveTypes.find(type => savedArchivedTypes.includes(type)) || '';
  }

  getSelectedKinds() {
    const kinds = this.kindForm.value;
    if (kinds == null) {
      return [];
    }
    return this.kindForm.value.filter((c: Filter) => c.selected && c.name !== ALL);
  }

  getSelectedKindsName() {
    const saved = this.cookieService.getCookie(ColumnId.KINDS)?.split(',') ?? [];
    if (saved.includes(ALL)) {
      return ALL;
    }
    return this.kinds.find(type => saved.includes(type.name))?.name || '';
  }

  getSelectedErrors() {
    const errors = this.errorForm.value;
    if (errors == null) {
      return [];
    }
    return this.errorForm.value.filter((e: Error) => e.selected && e.code !== ALL);
  }

  getSelectedErrorCodes() {
    const saved = this.cookieService.getCookie(ColumnId.ERRORS)?.split(',') ?? [];
    if (saved.includes(ALL)) {
      return ALL;
    }
    return this.errors.find(error => saved.includes(error.code))?.code || '';
  }

  onCustomRowsChange(event: any): void {
    const customValue = parseInt(event.target.value, 10);
    if (customValue >= 0) {
      this.customRowsPerPage = customValue;
      this.itemsPerPage = customValue;
      this.updatePaginatedData();
    }
  }

  getValueFromCookie(columnId: string) {
    return this.cookieService.getCookie(columnId);
  }

  getPageSize() {
    if (this.selectedItemsPerPageOption === 'all') {
      return this.filteredData.length;
    } else if (this.selectedItemsPerPageOption === 'custom') {
      return this.customRowsPerPage;
    } else {
      return this.selectedItemsPerPageOption ? +this.selectedItemsPerPageOption : DEFAULT_ITEMS_PER_PAGE;
    }
  }

  getTotalItems(): number {
    return this.filteredData.length;
  }

  getPaginationEndIndex(): number {
    if (this.currentPage === undefined) {
      return 0;
    }
    const end = this.itemsPerPage > this.getTotalItems() ? this.getTotalItems() : this.itemsPerPage * this.currentPage;
    if (end > this.getTotalItems()) {
      return this.getTotalItems();
    }
    return end;
  }

  getPaginationStartIndex(): number {
    if (this.currentPage === undefined) {
      return 0;
    }
    if (this.currentPage === 1) {
      return 1;
    }
    const index = (this.currentPage - 1) * this.itemsPerPage + 1;
    if (index < 0) {
      return 0;
    }
    return index;
  }

  filterValue(id: string, $event: Event): void {
    let element = $event.target as HTMLInputElement;
    this.cookieService.setCookie(id, element.value);
    this.applyFilters();
  }

  useRegexChange(event: MatCheckboxChange) {
    this.useRegex = event.checked;
    this.useRegexSubject.next(this.useRegex);
    this.cookieService.setCookie("useRegex", this.useRegex);
    this.applyFilters();
  }

  getUseRegex(): boolean {
    const useRegexFromCookie = this.getValueFromCookie('useRegex');
    return useRegexFromCookie === 'true' ? true : false;
  }

  saveToCookie(key: any, value: string): void {
    this.cookieService.setCookie(key, value)
    this.applyFilters()
  }

  applyCommonFilter(filter: string) {
    this.saveToCookie(COMMON_FILTER, filter);
    this.commonFilterSubject.next(filter);
  }

  highlightText(rowValue: string, id: any) {
    return this.displayTextUtils.highlight(rowValue, id, this.useRegex);
  }

  higlightError(error: ModelError) {
    return this.displayTextUtils.highlightError(error)
  }

  goToGitLabProjectDetails(project: GitLabProject): void {
    this.router.navigate(['/gitlab-project', project.projectId]);
  }

  goToBranches(project: GitLabProject): void {
    this.router.navigate(['/branches'], {queryParams: {projectId: project.projectId}});
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
